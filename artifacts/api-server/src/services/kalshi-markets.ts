import { logger } from "../lib/logger";
import { getFedFundsRate } from "./macro-data";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

interface KalshiMarket {
  ticker: string;
  series_ticker?: string;
  event_ticker?: string;
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
  close_time?: string;
  expiration_time?: string;
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

async function fetchFedCutProbability(): Promise<number | null> {
  const cacheKey = "FED-CUT-prob";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  try {
    const markets = await fetchSeriesMarkets("KXFED");
    if (!markets.length) {
      logger.warn("Kalshi KXFED: no open markets");
      cache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }

    // Group by event_ticker, pick the nearest upcoming FOMC event
    const byEvent = new Map<string, KalshiMarket[]>();
    for (const m of markets) {
      const ev = m.event_ticker ?? "_";
      const arr = byEvent.get(ev) ?? [];
      arr.push(m);
      byEvent.set(ev, arr);
    }
    const eventKey = (e: string) => {
      const arr = byEvent.get(e) ?? [];
      const t = arr[0]?.close_time ?? arr[0]?.expiration_time ?? "";
      return t || "9999";
    };
    const nearestEvent = [...byEvent.keys()].sort((a, b) => eventKey(a).localeCompare(eventKey(b)))[0];
    const eventMarkets = (byEvent.get(nearestEvent) ?? []).filter((m) => typeof m.floor_strike === "number");

    if (!eventMarkets.length) {
      logger.warn(`Kalshi KXFED: nearest event ${nearestEvent} has no strike data`);
      cache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }

    const rate = await getFedFundsRate();
    let cutProb: number | null = null;
    let logCurrentRate = "unknown";
    let logSource = "";

    if (rate) {
      logCurrentRate = `${rate.targetUpper.toFixed(2)}`;
      // Cut = next FOMC sets upper bound BELOW current upper.
      // YES on "rate above (currentUpper - 0.25)" = probability rate stays AT current or higher = NO cut.
      // So cut prob = 1 - YES at strike = currentUpper - 0.25.
      const targetStrike = rate.targetUpper - 0.25;
      let best: KalshiMarket | null = null;
      let bestDelta = Infinity;
      for (const m of eventMarkets) {
        const d = Math.abs((m.floor_strike as number) - targetStrike);
        if (d < bestDelta) {
          bestDelta = d;
          best = m;
        }
      }
      const yesPct = priceFromMarket(best);
      if (yesPct != null) {
        cutProb = Math.max(0, Math.min(100, 100 - yesPct));
        logSource = `1 - YES(${best?.ticker}@${(best?.floor_strike as number).toFixed(2)})=${100 - yesPct}%`;
      }
    } else {
      // Fallback: contract whose strike matches market-implied current rate (YES closest to 50%)
      // gives "rate stays at/above current" — its NO price ≈ cut probability.
      let pivot: KalshiMarket | null = null;
      let pivotDelta = Infinity;
      for (const m of eventMarkets) {
        const yes = priceFromMarket(m);
        if (yes == null) continue;
        const d = Math.abs(yes - 50);
        if (d < pivotDelta) {
          pivotDelta = d;
          pivot = m;
        }
      }
      const yesPct = priceFromMarket(pivot);
      if (yesPct != null) {
        cutProb = Math.max(0, Math.min(100, 100 - yesPct));
        logSource = `fallback: 100 - YES(${pivot?.ticker})=${100 - yesPct}%`;
      }
    }

    if (cutProb == null) {
      logger.warn(`Kalshi KXFED: could not compute cut probability from ${eventMarkets.length} strikes`);
    } else {
      const rounded = Math.round(cutProb);
      logger.info(
        `Kalshi KXFED: cut probability calculated as ${rounded}% from ${eventMarkets.length} strike contracts, current rate ${logCurrentRate}% [${logSource}]`,
      );
      cache.set(cacheKey, { value: rounded, ts: Date.now() });
      return rounded;
    }

    cache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  } catch (e: any) {
    logger.warn(`Kalshi KXFED: cut probability failed — ${e?.message ?? e}`);
    cache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  }
}

export async function fetchAllPredictionPrices(): Promise<PredictionPrices> {
  const [fedCut, recession, btc100k] = await Promise.allSettled([
    fetchFedCutProbability(),
    fetchKalshiMarketPrice("KXRECSSNBER"),
    fetchBtc100k(),
  ]);

  return {
    fedCut: fedCut.status === "fulfilled" ? fedCut.value : null,
    recession: recession.status === "fulfilled" ? recession.value : null,
    btc100k: btc100k.status === "fulfilled" ? btc100k.value : null,
  };
}
