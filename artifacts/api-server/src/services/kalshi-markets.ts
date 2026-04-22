import { logger } from "../lib/logger";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

interface KalshiMarket {
  ticker: string;
  series_ticker?: string;
  title?: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
  liquidity_dollars?: string;
  status?: string;
  cap_strike?: number;
  floor_strike?: number;
}

function num(s: string | number | undefined): number {
  if (s == null) return 0;
  const n = typeof s === "string" ? parseFloat(s) : s;
  return Number.isFinite(n) ? n : 0;
}

interface CacheEntry {
  value: number | null;
  ts: number;
}
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

async function fetchSeriesMarkets(seriesTicker: string): Promise<KalshiMarket[]> {
  const url = `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(seriesTicker)}&status=open&limit=200`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Kalshi HTTP ${res.status}`);
  const json = (await res.json()) as { markets?: KalshiMarket[] };
  return json.markets ?? [];
}

function liquidityScore(m: KalshiMarket): number {
  return num(m.volume_24h_fp) || num(m.volume_fp) || num(m.liquidity_dollars);
}

function pickMostLiquid(markets: KalshiMarket[]): KalshiMarket | null {
  if (!markets.length) return null;
  return markets.reduce((best, m) => (liquidityScore(m) > liquidityScore(best) ? m : best), markets[0]);
}

function priceFromMarket(m: KalshiMarket | null): number | null {
  if (!m) return null;
  const bid = num(m.yes_bid_dollars);
  const last = num(m.last_price_dollars);
  const raw = bid > 0 ? bid : last;
  if (raw <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

export async function fetchKalshiMarketPrice(
  seriesTicker: string,
  filter?: (m: KalshiMarket) => boolean,
): Promise<number | null> {
  const cacheKey = `${seriesTicker}|${filter ? "f" : ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  try {
    const markets = await fetchSeriesMarkets(seriesTicker);
    const filtered = filter ? markets.filter(filter) : markets;
    const market = pickMostLiquid(filtered);
    const price = priceFromMarket(market);
    if (price == null) {
      logger.warn(`Kalshi: failed to fetch ${seriesTicker} (no matching market)`);
    } else {
      logger.info(`Kalshi: fetched ${seriesTicker} at ${price}% (${market?.ticker ?? "?"})`);
    }
    cache.set(cacheKey, { value: price, ts: Date.now() });
    return price;
  } catch (e: any) {
    logger.warn(`Kalshi: failed to fetch ${seriesTicker} — ${e?.message ?? e}`);
    cache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  }
}

function btcStrikeFromMarket(m: KalshiMarket): number | null {
  if (typeof m.cap_strike === "number") return m.cap_strike;
  if (typeof m.floor_strike === "number") return m.floor_strike;
  const txt = `${m.title ?? ""} ${m.yes_sub_title ?? ""} ${m.no_sub_title ?? ""} ${m.ticker ?? ""}`;
  const match = txt.match(/\$?(\d{2,3}(?:[,_]\d{3})+|\d{4,6})/);
  if (!match) return null;
  return Number(match[1].replace(/[,_]/g, ""));
}

async function fetchBtc100k(): Promise<number | null> {
  const cacheKey = "BTC-100K-special";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
  try {
    const markets = await fetchSeriesMarkets("KXBTC");
    let best: KalshiMarket | null = null;
    let bestDelta = Infinity;
    for (const m of markets) {
      const strike = btcStrikeFromMarket(m);
      if (strike == null) continue;
      const delta = Math.abs(strike - 100_000);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = m;
      }
    }
    const price = priceFromMarket(best);
    if (price == null) {
      logger.warn("Kalshi: failed to fetch KXBTC (no $100K market)");
    } else {
      logger.info(`Kalshi: fetched KXBTC at ${price}% (${best?.ticker ?? "?"})`);
    }
    cache.set(cacheKey, { value: price, ts: Date.now() });
    return price;
  } catch (e: any) {
    logger.warn(`Kalshi: failed to fetch KXBTC — ${e?.message ?? e}`);
    cache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  }
}

export interface PredictionPrices {
  fedCut: number | null;
  recession: number | null;
  btc100k: number | null;
}

export async function fetchAllPredictionPrices(): Promise<PredictionPrices> {
  const [fedCut, recession, btc100k] = await Promise.allSettled([
    fetchKalshiMarketPrice("KXFED"),
    fetchKalshiMarketPrice("KXRECSSNBER"),
    fetchBtc100k(),
  ]);

  return {
    fedCut: fedCut.status === "fulfilled" ? fedCut.value : null,
    recession: recession.status === "fulfilled" ? recession.value : null,
    btc100k: btc100k.status === "fulfilled" ? btc100k.value : null,
  };
}
