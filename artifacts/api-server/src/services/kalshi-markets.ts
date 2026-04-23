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

  const HORIZON = new Date("2026-08-01T00:00:00Z").getTime();

  try {
    const markets = await fetchSeriesMarkets("KXFED");
    if (!markets.length) {
      logger.warn("Kalshi KXFED: no open markets");
      cache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }

    // Group by event_ticker
    const byEvent = new Map<string, KalshiMarket[]>();
    for (const m of markets) {
      const ev = m.event_ticker ?? "_";
      const arr = byEvent.get(ev) ?? [];
      arr.push(m);
      byEvent.set(ev, arr);
    }
    const eventCloseTs = (e: string): number => {
      const arr = byEvent.get(e) ?? [];
      const t = arr[0]?.close_time ?? arr[0]?.expiration_time ?? "";
      const ms = t ? Date.parse(t) : NaN;
      return Number.isFinite(ms) ? ms : Infinity;
    };

    const allEventsSorted = [...byEvent.keys()].sort((a, b) => eventCloseTs(a) - eventCloseTs(b));
    const horizonEvents = allEventsSorted.filter((e) => eventCloseTs(e) < HORIZON);

    const rate = await getFedFundsRate();
    const logCurrentRate = rate ? rate.targetUpper.toFixed(2) : "unknown";

    // Helper: compute hold probability (0..1) for one event
    const holdProbForEvent = (ev: string): { ev: string; ticker: string; holdProb: number } | null => {
      const eventMarkets = (byEvent.get(ev) ?? []).filter((m) => typeof m.floor_strike === "number");
      if (!eventMarkets.length) return null;

      let chosen: KalshiMarket | null = null;
      if (rate) {
        const targetStrike = rate.targetUpper - 0.25;
        let bestDelta = Infinity;
        for (const m of eventMarkets) {
          const d = Math.abs((m.floor_strike as number) - targetStrike);
          if (d < bestDelta) {
            bestDelta = d;
            chosen = m;
          }
        }
      } else {
        // Fallback: pivot at strike where YES is closest to 50%
        let pivotDelta = Infinity;
        for (const m of eventMarkets) {
          const yes = priceFromMarket(m);
          if (yes == null) continue;
          const d = Math.abs(yes - 50);
          if (d < pivotDelta) {
            pivotDelta = d;
            chosen = m;
          }
        }
      }
      const yesPct = priceFromMarket(chosen);
      if (yesPct == null || !chosen) return null;
      return { ev, ticker: chosen.ticker, holdProb: yesPct / 100 };
    };

    // Cumulative path: at least 2 events before horizon
    if (horizonEvents.length >= 2) {
      const contributions = horizonEvents
        .map(holdProbForEvent)
        .filter((x): x is { ev: string; ticker: string; holdProb: number } => x != null);

      if (contributions.length >= 2) {
        const cumulativeHold = contributions.reduce((acc, c) => acc * c.holdProb, 1);
        const cutProb = Math.round((1 - cumulativeHold) * 100);
        const holdList = contributions
          .map((c) => `${c.ev}=${Math.round(c.holdProb * 100)}%`)
          .join(", ");
        logger.info(
          `Kalshi KXFED: cumulative cut probability by July 2026 = ${cutProb}% across ${contributions.length} FOMC events (hold probs: ${holdList}), current rate ${logCurrentRate}%`,
        );
        cache.set(cacheKey, { value: cutProb, ts: Date.now() });
        return cutProb;
      }
    }

    // Fallback: single nearest event
    const nearest = allEventsSorted[0];
    const single = nearest ? holdProbForEvent(nearest) : null;
    if (single) {
      const cutProb = Math.max(0, Math.min(100, Math.round((1 - single.holdProb) * 100)));
      logger.info(
        `Kalshi KXFED: single-event cut probability = ${cutProb}% from event ${single.ev} [${single.ticker}, hold=${Math.round(single.holdProb * 100)}%], current rate ${logCurrentRate}% (only ${horizonEvents.length} qualifying event before Aug 2026)`,
      );
      cache.set(cacheKey, { value: cutProb, ts: Date.now() });
      return cutProb;
    }

    logger.warn(`Kalshi KXFED: could not compute cut probability (${byEvent.size} events, ${horizonEvents.length} before horizon)`);
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
