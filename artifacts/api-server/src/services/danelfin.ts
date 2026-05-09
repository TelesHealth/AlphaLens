import { logger } from "../lib/logger";

export interface DanelfinScore {
  ticker: string;
  date: string;
  aiScore: number;
  technical: number;
  fundamental: number;
  sentiment: number;
  lowRisk: number;
  signal: string;
}

const BASE_URL = "https://apirest.danelfin.com";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  value: DanelfinScore | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function deriveSignal(aiScore: number): string {
  if (aiScore >= 8) return "strong_buy";
  if (aiScore >= 6) return "buy";
  if (aiScore === 5) return "neutral";
  if (aiScore <= 2) return "strong_sell";
  if (aiScore <= 3) return "sell";
  return "hold";
}

function isCacheFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/**
 * Fetch the latest Danelfin AI score for a US-listed equity or ETF.
 * Returns null on missing key, network error, unknown ticker, or any unexpected
 * shape. Never throws. Cached per-ticker for 24h.
 *
 * Live API shape (despite the docs example): an object keyed by date string
 *   { "YYYY-MM-DD": { aiscore, technical, fundamental, sentiment, low_risk }, ... }
 * Empty array `[]` is returned for unknown tickers. We pick the most recent date.
 */
export async function getDanelfinScore(
  ticker: string,
): Promise<DanelfinScore | null> {
  if (!process.env.DANELFIN_API_KEY) return null;
  const key = ticker.trim().toUpperCase();
  if (!key) return null;

  const cached = cache.get(key);
  if (isCacheFresh(cached)) return cached.value;

  try {
    const url = `${BASE_URL}/ranking?ticker=${encodeURIComponent(
      key,
    )}&fields=date,ticker,aiscore,technical,fundamental,sentiment,low_risk`;
    const res = await fetch(url, {
      headers: { "x-api-key": process.env.DANELFIN_API_KEY! },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      logger.warn(
        { ticker: key, status: res.status },
        `Danelfin: failed to fetch score for ${key}`,
      );
      cache.set(key, { value: null, fetchedAt: Date.now() });
      return null;
    }

    const body = (await res.json()) as unknown;

    let parsed: DanelfinScore | null = null;

    if (Array.isArray(body)) {
      // Documented shape (array of rows). Take first.
      const first = body[0] as Record<string, unknown> | undefined;
      if (first && typeof first === "object") {
        parsed = {
          ticker: String(first.ticker ?? key),
          date: String(first.date ?? ""),
          aiScore: Number(first.aiscore ?? 0),
          technical: Number(first.technical ?? 0),
          fundamental: Number(first.fundamental ?? 0),
          sentiment: Number(first.sentiment ?? 0),
          lowRisk: Number(first.low_risk ?? 0),
          signal: deriveSignal(Number(first.aiscore ?? 0)),
        };
      }
    } else if (body && typeof body === "object") {
      // Live shape: { "YYYY-MM-DD": {...}, ... }. Pick most recent date.
      const entries = Object.entries(body as Record<string, unknown>);
      const dated = entries
        .filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === "object")
        .sort(([a], [b]) => (a < b ? 1 : -1));
      if (dated.length > 0) {
        const [date, raw] = dated[0];
        const r = raw as Record<string, unknown>;
        const aiScore = Number(r.aiscore ?? 0);
        parsed = {
          ticker: key,
          date,
          aiScore,
          technical: Number(r.technical ?? 0),
          fundamental: Number(r.fundamental ?? 0),
          sentiment: Number(r.sentiment ?? 0),
          lowRisk: Number(r.low_risk ?? 0),
          signal: deriveSignal(aiScore),
        };
      }
    }

    cache.set(key, { value: parsed, fetchedAt: Date.now() });
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(
      { ticker: key, err: msg },
      `Danelfin: failed to fetch score for ${key}`,
    );
    cache.set(key, { value: null, fetchedAt: Date.now() });
    return null;
  }
}

/**
 * Fetch Danelfin scores for many tickers in parallel. Caller is responsible
 * for filtering out crypto, FX, and prediction-market symbols — Danelfin only
 * covers US-listed stocks and ETFs.
 */
export async function getDanelfinScores(
  tickers: string[],
): Promise<Map<string, DanelfinScore | null>> {
  const out = new Map<string, DanelfinScore | null>();
  const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)));
  const settled = await Promise.allSettled(unique.map((t) => getDanelfinScore(t)));
  unique.forEach((t, i) => {
    const r = settled[i];
    out.set(t, r.status === "fulfilled" ? r.value : null);
  });
  return out;
}

/**
 * Asset classes Danelfin covers: US-listed equities and ETFs. Crypto, FX, and
 * prediction markets are NOT covered.
 */
export function isDanelfinEligible(sector: string | null | undefined): boolean {
  const s = (sector ?? "").toLowerCase();
  if (!s) return false;
  return s !== "crypto" && s !== "prediction" && s !== "fx" && s !== "forex";
}

export function formatDanelfinContext(
  ticker: string,
  score: DanelfinScore | null,
): string {
  if (!score) return `Danelfin: not available for ${ticker}`;
  return `DANELFIN AI SCORE for ${ticker}:
  Overall: ${score.aiScore}/10 → ${score.signal}
  Technical: ${score.technical}/10
  Fundamental: ${score.fundamental}/10
  Sentiment: ${score.sentiment}/10
  Low Risk: ${score.lowRisk}/10`;
}
