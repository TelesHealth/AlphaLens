import { db } from "@workspace/db";
import { assetsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

const CRYPTO_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
};

const YAHOO_MAP: Record<string, string> = {
  SPY: "SPY",
  QQQ: "QQQ",
  GLD: "GLD",
  USO: "USO",
  UNG: "UNG",
  EURUSD: "EURUSD=X",
};

interface PriceUpdate {
  currentPrice: number;
  priceChange24h: number;
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AlphaLens/1.0" },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function fetchCryptoPrices(): Promise<Map<string, PriceUpdate>> {
  const results = new Map<string, PriceUpdate>();
  const ids = Object.values(CRYPTO_MAP).join(",");

  try {
    const res = await fetchWithTimeout(
      `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    );

    if (!res.ok) {
      logger.warn({ status: res.status }, "CoinGecko API error");
      return results;
    }

    const data = await res.json() as Record<string, { usd: number; usd_24h_change: number }>;

    for (const [symbol, cgId] of Object.entries(CRYPTO_MAP)) {
      const coin = data[cgId];
      if (coin) {
        results.set(symbol, {
          currentPrice: coin.usd,
          priceChange24h: Math.round(coin.usd_24h_change * 100) / 100,
        });
      }
    }
    const btc = results.get("BTC")?.currentPrice;
    const eth = results.get("ETH")?.currentPrice;
    const sol = results.get("SOL")?.currentPrice;
    console.log(
      `CoinGecko: fresh prices fetched for BTC=$${btc ?? "n/a"}, ETH=$${eth ?? "n/a"}, SOL=$${sol ?? "n/a"}`
    );
  } catch (e: any) {
    console.warn("CoinGecko: using cached prices (rate limited or fetch failed)");
    logger.error({ err: e.message }, "Failed to fetch crypto prices");
  }

  return results;
}

async function fetchYahooPrice(yahooSymbol: string): Promise<PriceUpdate | null> {
  try {
    const res = await fetchWithTimeout(
      `${YAHOO_BASE}/${yahooSymbol}?interval=1d&range=5d`
    );

    if (!res.ok) {
      logger.warn({ status: res.status, symbol: yahooSymbol }, "Yahoo Finance API error");
      return null;
    }

    const data = await res.json() as any;
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice;

    const closes: number[] = result.indicators?.quote?.[0]?.close?.filter(
      (c: number | null) => c != null
    ) ?? [];

    let previousClose: number | undefined;
    if (closes.length >= 2) {
      previousClose = closes[closes.length - 2];
    }
    if (!previousClose) {
      previousClose = meta.chartPreviousClose ?? meta.previousClose;
    }

    if (!currentPrice || !previousClose) return null;

    const change = ((currentPrice - previousClose) / previousClose) * 100;

    return {
      currentPrice: Math.round(currentPrice * 100) / 100,
      priceChange24h: Math.round(change * 100) / 100,
    };
  } catch (e: any) {
    logger.error({ err: e.message, symbol: yahooSymbol }, "Failed to fetch Yahoo price");
    return null;
  }
}

async function fetchStockPrices(): Promise<Map<string, PriceUpdate>> {
  const results = new Map<string, PriceUpdate>();

  const fetches = Object.entries(YAHOO_MAP).map(async ([symbol, yahooSymbol]) => {
    const price = await fetchYahooPrice(yahooSymbol);
    if (price) {
      results.set(symbol, price);
    }
  });

  await Promise.allSettled(fetches);
  return results;
}

const PREDICTION_DEFAULTS: Record<string, PriceUpdate> = {
  "FED-CUT": { currentPrice: 72, priceChange24h: 0 },
  "US-REC": { currentPrice: 25, priceChange24h: 0 },
  "BTC-100K": { currentPrice: 45, priceChange24h: 0 },
};

async function fetchPredictionPrices(): Promise<Map<string, PriceUpdate>> {
  const results = new Map<string, PriceUpdate>();
  for (const [symbol, defaults] of Object.entries(PREDICTION_DEFAULTS)) {
    results.set(symbol, defaults);
  }
  return results;
}



export async function refreshAllMarketData(): Promise<number> {
  logger.info("Starting market data refresh...");
  let updated = 0;

  
  const [cryptoPrices, stockPrices, predictionPrices] = await Promise.all([
    fetchCryptoPrices(),
    fetchStockPrices(),
    fetchPredictionPrices(),
  ]);

  const allAssets = await db.select().from(assetsTable);

  for (const asset of allAssets) {
    const priceUpdate =
      cryptoPrices.get(asset.symbol) ??
      stockPrices.get(asset.symbol) ??
      predictionPrices.get(asset.symbol);

    if (priceUpdate) {
      await db
        .update(assetsTable)
        .set({
          currentPrice: priceUpdate.currentPrice,
          priceChange24h: priceUpdate.priceChange24h,
          updatedAt: new Date(),
        })
        .where(eq(assetsTable.id, asset.id));
      updated++;
      logger.info(
        { symbol: asset.symbol, price: priceUpdate.currentPrice, change: priceUpdate.priceChange24h },
        "Updated price"
      );
    
    }
  }

  logger.info({ updated, total: allAssets.length }, "Market data refresh complete");
  
  return updated;
}
