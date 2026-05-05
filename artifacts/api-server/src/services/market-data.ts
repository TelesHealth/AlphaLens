import { db } from "@workspace/db";
import { assetsTable, recommendationsTable } from "@workspace/db/schema";
import { eq, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { fetchAllPredictionPrices } from "./kalshi-markets";

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

const PRICE_HISTORY_TTL_MS = 60 * 60 * 1000;
const priceHistoryCache: Map<
  string,
  { fetchedAt: number; prices: number[] }
> = new Map();

export async function getPriceHistory(
  ticker: string,
  days: number = 60,
): Promise<number[]> {
  const key = `${ticker.toUpperCase()}:${days}`;
  const cached = priceHistoryCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < PRICE_HISTORY_TTL_MS) {
    return cached.prices;
  }

  const symbol = ticker.toUpperCase();
  const cgId = CRYPTO_MAP[symbol];
  let prices: number[] = [];

  try {
    if (cgId) {
      const res = await fetchWithTimeout(
        `${COINGECKO_BASE}/coins/${cgId}/market_chart?vs_currency=usd&days=${days}`,
      );
      if (!res.ok) {
        logger.warn(
          { status: res.status, ticker },
          "Price history: CoinGecko error",
        );
        return cached?.prices ?? [];
      }
      const data = (await res.json()) as { prices?: [number, number][] };
      prices = (data.prices ?? [])
        .map((p) => p[1])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    } else {
      const yahooSym = YAHOO_MAP[symbol] ?? symbol;
      const range = days <= 30 ? "1mo" : days <= 90 ? "3mo" : "6mo";
      const res = await fetchWithTimeout(
        `${YAHOO_BASE}/${yahooSym}?interval=1d&range=${range}`,
      );
      if (!res.ok) {
        logger.warn(
          { status: res.status, ticker },
          "Price history: Yahoo error",
        );
        return cached?.prices ?? [];
      }
      const data = (await res.json()) as any;
      const closes: (number | null)[] =
        data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      prices = closes.filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v),
      );
    }
  } catch (e: any) {
    logger.warn(
      { err: e.message, ticker },
      "Price history: fetch failed",
    );
    return cached?.prices ?? [];
  }

  if (prices.length > 0) {
    priceHistoryCache.set(key, { fetchedAt: Date.now(), prices });
  }
  return prices;
}

interface PriceUpdate {
  currentPrice: number;
  priceChange24h: number;
  dataFreshness?: DataFreshness;
}

export interface DataFreshness {
  source: string;
  fetchedAt: string;
  cacheAge: number;
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

let cryptoCache: Map<string, PriceUpdate> = new Map();
let cryptoCacheTime = 0;
const CRYPTO_CACHE_TTL = 10_000;

function decoratedCryptoCache(): Map<string, PriceUpdate> {
  const out = new Map<string, PriceUpdate>();
  const fetchedAt = new Date(cryptoCacheTime).toISOString();
  const cacheAgeSec = Math.round((Date.now() - cryptoCacheTime) / 1000);
  for (const [k, v] of cryptoCache) {
    out.set(k, {
      ...v,
      dataFreshness: {
        source: "CoinGecko",
        fetchedAt,
        cacheAge: cacheAgeSec,
      },
    });
  }
  return out;
}

export function getCryptoFreshness(symbol: string): DataFreshness | null {
  if (cryptoCacheTime === 0 || !cryptoCache.has(symbol.toUpperCase())) return null;
  return {
    source: "CoinGecko",
    fetchedAt: new Date(cryptoCacheTime).toISOString(),
    cacheAge: Math.round((Date.now() - cryptoCacheTime) / 1000),
  };
}

async function fetchCryptoPrices(bypassCache = false): Promise<Map<string, PriceUpdate>> {
  if (!bypassCache && cryptoCache.size > 0 && Date.now() - cryptoCacheTime < CRYPTO_CACHE_TTL) {
    console.warn("CoinGecko: using cached prices (rate limit guard)");
    return decoratedCryptoCache();
  }

  const results = new Map<string, PriceUpdate>();
  const ids = Object.values(CRYPTO_MAP).join(",");

  try {
    const res = await fetchWithTimeout(
      `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    );

    if (!res.ok) {
      logger.warn({ status: res.status }, "CoinGecko API error");
      return decoratedCryptoCache();
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
    cryptoCache = new Map(results);
    cryptoCacheTime = Date.now();
    const fetchedAt = new Date(cryptoCacheTime).toISOString();
    for (const [sym, v] of results) {
      results.set(sym, {
        ...v,
        dataFreshness: { source: "CoinGecko", fetchedAt, cacheAge: 0 },
      });
    }
    const btc = results.get("BTC")?.currentPrice;
    const eth = results.get("ETH")?.currentPrice;
    const sol = results.get("SOL")?.currentPrice;
    console.log(
      `CoinGecko: fresh prices fetched for BTC=$${btc ?? "n/a"}, ETH=$${eth ?? "n/a"}, SOL=$${sol ?? "n/a"}`
    );
  } catch (e: any) {
    console.warn("CoinGecko: using cached prices (fetch failed)");
    logger.error({ err: e.message }, "Failed to fetch crypto prices");
    return new Map(cryptoCache);
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
  const live = await fetchAllPredictionPrices();
  const map: Record<string, number | null> = {
    "FED-CUT": live.fedCut,
    "US-REC": live.recession,
    "BTC-100K": live.btc100k,
  };
  for (const [symbol, defaults] of Object.entries(PREDICTION_DEFAULTS)) {
    const livePrice = map[symbol];
    if (livePrice != null) {
      results.set(symbol, { currentPrice: livePrice, priceChange24h: 0 });
    } else {
      results.set(symbol, defaults);
    }
  }
  logger.info(
    `Kalshi prediction prices: FED-CUT=${live.fedCut ?? "n/a"}%, US-REC=${live.recession ?? "n/a"}%, BTC-100K=${live.btc100k ?? "n/a"}%`,
  );
  return results;
}



let isRefreshing = false;

export async function refreshAllMarketData(
  bypassCache = false,
): Promise<number | { skipped: true; status: "refresh_already_running" }> {
  if (isRefreshing) {
    logger.info("Market refresh already in progress, skipping");
    return { skipped: true, status: "refresh_already_running" };
  }
  isRefreshing = true;
  try {
    if (bypassCache) {
      cryptoCache.clear();
      cryptoCacheTime = 0;
    }
    return await doRefresh(bypassCache);
  } finally {
    isRefreshing = false;
  }
}

async function doRefresh(bypassCache: boolean): Promise<number> {
  logger.info("Starting market data refresh...");
  let updated = 0;

  
  const [cryptoPrices, stockPrices, predictionPrices] = await Promise.all([
    fetchCryptoPrices(bypassCache),
    fetchStockPrices(),
    fetchPredictionPrices(),
  ]);

  const allAssets = await db.select().from(assetsTable);

  for (const asset of allAssets) {
    const isPrediction = predictionPrices.has(asset.symbol);
    const priceUpdate =
      cryptoPrices.get(asset.symbol) ??
      stockPrices.get(asset.symbol) ??
      predictionPrices.get(asset.symbol);

    if (priceUpdate) {
      const patch: {
        currentPrice: number;
        priceChange24h: number;
        updatedAt: Date;
        marketProbability?: number;
      } = {
        currentPrice: priceUpdate.currentPrice,
        priceChange24h: priceUpdate.priceChange24h,
        updatedAt: new Date(),
      };
      if (isPrediction) {
        patch.marketProbability = priceUpdate.currentPrice;
      }
      await db.update(assetsTable).set(patch).where(eq(assetsTable.id, asset.id));
      updated++;
      logger.info(
        {
          symbol: asset.symbol,
          price: priceUpdate.currentPrice,
          change: priceUpdate.priceChange24h,
          marketProbability: isPrediction ? priceUpdate.currentPrice : undefined,
        },
        "Updated price",
      );
    }
  }

  logger.info({ updated, total: allAssets.length }, "Market data refresh complete");

  await refreshRecommendationEdges();

  return updated;
}

async function refreshRecommendationEdges(): Promise<void> {
  const openRecs = await db
    .select()
    .from(recommendationsTable)
    .where(isNull(recommendationsTable.outcome));

  if (openRecs.length === 0) {
    logger.info("Edge refresh: no open recommendations to update");
    return;
  }

  const allAssets = await db.select().from(assetsTable);
  const byId = new Map(allAssets.map((a) => [a.id, a]));
  const byTitle = new Map(
    allAssets.map((a) => [a.name.toLowerCase(), a] as const),
  );
  const bySymbol = new Map(
    allAssets.map((a) => [a.symbol.toLowerCase(), a] as const),
  );

  let updated = 0;
  for (const rec of openRecs) {
    let asset = rec.assetId != null ? byId.get(rec.assetId) : undefined;
    if (!asset) {
      const t = (rec.assetTitle ?? "").toLowerCase();
      asset = byTitle.get(t) ?? bySymbol.get(t);
      if (!asset) {
        for (const a of allAssets) {
          if (
            t.includes(a.name.toLowerCase()) ||
            t.includes(a.symbol.toLowerCase())
          ) {
            asset = a;
            break;
          }
        }
      }
    }
    if (!asset) continue;

    const isPrediction = rec.assetClass === "prediction";
    const aiProb = rec.aiProbability ?? 0;
    let newEdge = rec.edge ?? 0;
    let newMarketPrice: number | null = rec.marketPrice ?? null;
    let newAssetPriceAtCall: number | null = rec.assetPriceAtCall ?? null;
    const newEdgeType: "probability_gap" | "directional_conviction" =
      isPrediction ? "probability_gap" : "directional_conviction";

    if (isPrediction) {
      const mp = asset.marketProbability ?? asset.currentPrice ?? null;
      newMarketPrice = mp;
      newEdge = aiProb - (mp ?? 0);
    } else {
      newMarketPrice = asset.currentPrice ?? null;
      // Backfill assetPriceAtCall for legacy recs that pre-date the field;
      // for newly-created recs this is already set at insert-time.
      if (newAssetPriceAtCall == null) {
        newAssetPriceAtCall = newMarketPrice;
      }
      // Recompute directional edge if it's missing (legacy backfill);
      // otherwise leave it as-is since aiProbability doesn't change.
      if (rec.edge == null) {
        const dirUpper = (rec.direction ?? "").toUpperCase();
        const isShort = dirUpper === "SHORT" || dirUpper === "NO";
        newEdge = isShort ? 50 - aiProb : aiProb - 50;
      }
    }

    const confidenceWeight = (rec.confidence ?? 60) / 100;
    const newConvictionScore =
      Math.round(newEdge * confidenceWeight * 10) / 10;

    // Track significant edge changes (>= 5 pts) for the alert system.
    const previousEdge = rec.edge;
    const edgeChange =
      typeof previousEdge === "number" ? Math.abs(newEdge - previousEdge) : 0;
    const isSignificantChange =
      typeof previousEdge === "number" && edgeChange >= 5;

    const updateValues: {
      edge: number;
      edgeType: "probability_gap" | "directional_conviction";
      convictionScore: number;
      edgeCalculatedAt: Date;
      marketPrice: number | null;
      assetPriceAtCall: number | null;
      edgePrevious?: number;
      edgeChangedAt?: Date;
    } = {
      edge: newEdge,
      edgeType: newEdgeType,
      convictionScore: newConvictionScore,
      edgeCalculatedAt: new Date(),
      marketPrice: newMarketPrice,
      assetPriceAtCall: newAssetPriceAtCall,
    };

    if (isSignificantChange && previousEdge != null) {
      updateValues.edgePrevious = previousEdge;
      updateValues.edgeChangedAt = new Date();
      const delta = newEdge - previousEdge;
      logger.info(
        `Edge change: rec #${rec.id} ${rec.assetTitle} edge moved from ${previousEdge.toFixed(1)} to ${newEdge.toFixed(1)} (${delta > 0 ? "+" : ""}${delta.toFixed(1)})`,
      );
    }

    // Backfill explanation fields for legacy recs created before these
    // columns existed. New recs already have richer Claude-authored text.
    const setExt = updateValues as typeof updateValues & {
      edgeExplanation?: string;
      confidenceRationale?: string;
    };
    if (!rec.edgeExplanation || rec.edgeExplanation.trim().length === 0) {
      const mpStr =
        newMarketPrice != null
          ? newMarketPrice.toFixed(1) + (isPrediction ? "%" : "")
          : "N/A";
      setExt.edgeExplanation = `The AI assigns ${aiProb.toFixed(1)}% probability vs market's ${mpStr}, a ${newEdge.toFixed(1)}-point ${
        isPrediction ? "gap" : "directional edge"
      }.`;
    }
    if (
      !rec.confidenceRationale ||
      rec.confidenceRationale.trim().length === 0
    ) {
      setExt.confidenceRationale =
        "Confidence based on available macro and market data.";
    }

    await db
      .update(recommendationsTable)
      .set(updateValues)
      .where(eq(recommendationsTable.id, rec.id));
    updated++;
  }

  logger.info(
    `Edge refresh: updated ${updated} of ${openRecs.length} open recommendations`,
  );
}
