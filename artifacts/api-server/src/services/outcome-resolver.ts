import { db } from "@workspace/db";
import { recommendationsTable, assetsTable } from "@workspace/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  fetchCPI,
  fetchUnemploymentRate,
  fetchGDP,
  getFedFundsRate,
} from "./macro-data";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const POLYMARKET_BASE = "https://clob.polymarket.com";
const DEFAULT_PAPER_TRADE_USD = 100;

type Outcome = "correct" | "incorrect" | "partial";

export interface ResolutionResult {
  resolved: boolean;
  outcome?: Outcome;
  note?: string;
  resolutionDate?: Date;
  marketPriceAtResolution?: number | null;
  paperReturn?: number | null;
}

type Rec = typeof recommendationsTable.$inferSelect;

function lowerTitle(rec: Rec): string {
  return `${rec.assetTitle ?? ""} ${rec.title ?? ""}`.toLowerCase();
}

function normalizeDirection(d: string | null | undefined): "yes" | "no" | "long" | "short" | "watch" | "unknown" {
  const v = (d ?? "").toString().trim().toLowerCase();
  if (v === "yes" || v === "no" || v === "long" || v === "short" || v === "watch") return v;
  if (v === "bullish") return "long";
  if (v === "bearish") return "short";
  return "unknown";
}

export type DerivedPlatform =
  | "kalshi"
  | "polymarket"
  | "price"
  | "macro"
  | "unknown";

export function derivePlatform(rec: Rec): DerivedPlatform {
  const cls = (rec.assetClass ?? "").toLowerCase();
  const title = lowerTitle(rec);

  if (cls === "macro") return "macro";

  // Real-asset classes that resolve via spot price comparison
  const priceClasses = new Set([
    "crypto",
    "equities",
    "equity",
    "stocks",
    "stock",
    "etf",
    "etfs",
    "commodity",
    "commodities",
    "energy",
    "fx",
    "forex",
  ]);
  if (priceClasses.has(cls)) return "price";

  // Prediction markets — disambiguate Kalshi vs Polymarket via title keywords
  if (cls === "prediction" || cls === "predictions") {
    const polymarketKeywords = [
      "war",
      "ceasefire",
      "invasion",
      "election",
      "president",
      "oscar",
      "grammy",
      "championship",
      "world cup",
      "nba finals",
    ];
    if (polymarketKeywords.some((kw) => title.includes(kw))) return "polymarket";
    return "kalshi";
  }

  return "unknown";
}

// -------------------------- KALSHI --------------------------

const KALSHI_SERIES_MAP: Array<{ keywords: string[]; ticker: string }> = [
  { keywords: ["fed rate", "rate cut", "fomc", "federal reserve"], ticker: "KXFED" },
  { keywords: ["recession"], ticker: "KXRECSSNBER" },
  { keywords: ["btc", "bitcoin"], ticker: "KXBTC" },
  { keywords: ["cpi", "inflation"], ticker: "KXCPI" },
  { keywords: ["unemployment", "jobs report", "payrolls"], ticker: "KXUNRATE" },
  { keywords: ["gdp"], ticker: "KXGDP" },
];

export function inferKalshiSeriesTicker(rec: Rec): string | null {
  const title = lowerTitle(rec);
  for (const entry of KALSHI_SERIES_MAP) {
    if (entry.keywords.some((kw) => title.includes(kw))) return entry.ticker;
  }
  return null;
}

interface KalshiFinalizedMarket {
  ticker: string;
  title?: string;
  status?: string;
  result?: string;
  close_time?: string;
}

// Per-process cache for finalized-market fetches. Many open recs map to the
// same series ticker (KXFED, KXBTC, etc.); without this cache a single
// runOutcomeResolution() pass would issue hundreds of identical Kalshi
// requests and trip 429 rate limits.
type FinalizedCacheEntry = { markets: KalshiFinalizedMarket[]; ts: number };
const KALSHI_FINALIZED_TTL_MS = 5 * 60 * 1000;
const kalshiFinalizedCache = new Map<string, FinalizedCacheEntry>();

async function fetchFinalizedMarkets(ticker: string): Promise<KalshiFinalizedMarket[]> {
  const cached = kalshiFinalizedCache.get(ticker);
  if (cached && Date.now() - cached.ts < KALSHI_FINALIZED_TTL_MS) return cached.markets;

  const url = `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(ticker)}&status=finalized&limit=200`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn(`Kalshi finalized fetch HTTP ${res.status} for ${ticker}`);
      kalshiFinalizedCache.set(ticker, { markets: [], ts: Date.now() });
      return [];
    }
    const json = (await res.json()) as { markets?: KalshiFinalizedMarket[] };
    const markets = Array.isArray(json.markets) ? json.markets : [];
    kalshiFinalizedCache.set(ticker, { markets, ts: Date.now() });
    return markets;
  } catch (e: any) {
    logger.warn(`Kalshi finalized fetch failed for ${ticker}: ${e?.message ?? e}`);
    kalshiFinalizedCache.set(ticker, { markets: [], ts: Date.now() });
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveKalshiOutcome(rec: Rec): Promise<ResolutionResult> {
  const ticker = inferKalshiSeriesTicker(rec);
  if (!ticker) return { resolved: false };

  const markets = await fetchFinalizedMarkets(ticker);
  const finalized = markets.filter(
    (m) => m.status === "finalized" && (m.result === "yes" || m.result === "no"),
  );
  if (finalized.length === 0) return { resolved: false };

  // Pick the earliest finalized market whose close_time is on/after the rec
  // was created. We do NOT fall back to an arbitrary finalized market, because
  // that risks scoring against a contract that closed BEFORE the rec existed.
  const recCreatedMs = rec.createdAt ? new Date(rec.createdAt).getTime() : 0;
  const eligible = finalized
    .map((m) => ({ m, closeMs: m.close_time ? Date.parse(m.close_time) : NaN }))
    .filter(({ closeMs }) => Number.isFinite(closeMs) && closeMs >= recCreatedMs)
    .sort((a, b) => a.closeMs - b.closeMs);

  if (eligible.length === 0) return { resolved: false };
  const chosen = eligible[0].m;
  const result = chosen.result === "yes" ? "yes" : "no";
  const dir = normalizeDirection(rec.direction);

  let outcome: Outcome;
  if (dir === "yes" && result === "yes") outcome = "correct";
  else if (dir === "yes" && result === "no") outcome = "incorrect";
  else if (dir === "no" && result === "no") outcome = "correct";
  else if (dir === "no" && result === "yes") outcome = "incorrect";
  else {
    // direction not YES/NO — can't score
    return { resolved: false };
  }

  const marketPriceAtResolution = result === "yes" ? 100 : 0;
  const entryPrice = typeof rec.marketPrice === "number" ? rec.marketPrice : null;
  let paperReturn: number | null = null;
  if (entryPrice != null) {
    // Paper bought at entryPrice (cents-on-the-dollar). Settled at 100 (yes) or 0 (no).
    const wantedYes = dir === "yes";
    const settled = result === "yes" ? 100 : 0;
    const buyPrice = wantedYes ? entryPrice : 100 - entryPrice;
    const settlePrice = wantedYes ? settled : 100 - settled;
    if (buyPrice > 0) {
      paperReturn =
        Math.round(((settlePrice - buyPrice) / 100) * DEFAULT_PAPER_TRADE_USD * 100) / 100;
    }
  }

  return {
    resolved: true,
    outcome,
    resolutionDate: chosen.close_time ? new Date(chosen.close_time) : new Date(),
    note: `Kalshi contract resolved: ${chosen.title ?? chosen.ticker} → ${result.toUpperCase()}`,
    marketPriceAtResolution,
    paperReturn,
  };
}

// -------------------------- POLYMARKET --------------------------

interface PolymarketMarket {
  question?: string;
  closed?: boolean;
  active?: boolean;
  outcomes?: string[];
  outcome_prices?: string[];
  winning_side?: string;
  end_date_iso?: string;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function resolvePolymarketOutcome(rec: Rec): Promise<ResolutionResult> {
  const target = normalizeForMatch(rec.assetTitle ?? "");
  if (!target) return { resolved: false };

  const url = `${POLYMARKET_BASE}/markets?limit=500`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let json: { data?: PolymarketMarket[] } | PolymarketMarket[];
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn(`Polymarket fetch HTTP ${res.status}`);
      return { resolved: false };
    }
    json = (await res.json()) as any;
  } catch (e: any) {
    logger.warn(`Polymarket fetch failed: ${e?.message ?? e}`);
    return { resolved: false };
  } finally {
    clearTimeout(timer);
  }

  const list: PolymarketMarket[] = Array.isArray(json)
    ? json
    : (json?.data ?? []);

  // Heuristic title match — require EVERY strong token (>3 chars) AND at least
  // one short token (<=3 chars, e.g. "BTC", "CPI", "GDP") to appear in the
  // market question. Without this guard, a rec whose title contains only short
  // tokens would produce an empty `targetWords`, so `every()` would return
  // true for every market and we'd score against a random closed market.
  const allWords = target.split(" ").filter(Boolean);
  if (allWords.length === 0) return { resolved: false };
  const strongWords = allWords.filter((w) => w.length > 3);
  const shortWords = allWords.filter((w) => w.length <= 3);
  const requiredWords = strongWords.length > 0 ? strongWords : allWords;
  const matches = list.filter((m) => {
    const q = normalizeForMatch(m.question ?? "");
    if (!q) return false;
    if (!requiredWords.every((w) => q.includes(w))) return false;
    // When we had to fall back to short-only matching, also demand that at
    // least one short token co-occurs — guarantees a non-trivial overlap.
    if (strongWords.length === 0 && shortWords.length > 0) {
      return shortWords.some((w) => q.includes(w));
    }
    return true;
  });

  const closedMatch = matches.find((m) => m.closed === true && !!m.winning_side);
  if (!closedMatch) return { resolved: false };

  const winningSide = (closedMatch.winning_side ?? "").toLowerCase();
  const dir = normalizeDirection(rec.direction);
  let outcome: Outcome;
  if (dir === "yes" && winningSide === "yes") outcome = "correct";
  else if (dir === "yes" && winningSide === "no") outcome = "incorrect";
  else if (dir === "no" && winningSide === "no") outcome = "correct";
  else if (dir === "no" && winningSide === "yes") outcome = "incorrect";
  else return { resolved: false };

  const marketPriceAtResolution = winningSide === "yes" ? 100 : 0;
  return {
    resolved: true,
    outcome,
    resolutionDate: closedMatch.end_date_iso ? new Date(closedMatch.end_date_iso) : new Date(),
    note: `Polymarket resolved: ${closedMatch.question ?? "(market)"} → ${winningSide.toUpperCase()}`,
    marketPriceAtResolution,
    paperReturn: null,
  };
}

// -------------------------- UNRESOLVED CATEGORIZATION --------------------------

export type UnresolvedCategory = "needs-review" | "approaching" | "still-open";

const SEVEN_DAYS_MS = 7 * 86_400_000;
const SIXTY_DAYS_MS = 60 * 86_400_000;

/**
 * Single source of truth for how an open `trade` rec is categorized when the
 * resolver could not (or did not) resolve it. Used by the daily digest in
 * `runOutcomeResolution` and by the leaderboard `pendingResolution` stat so
 * the two cannot drift.
 *
 * - Price/macro recs: parse `window` → past-deadline = needs-review,
 *   within 7 days = approaching, future = still-open.
 * - Kalshi/Polymarket recs: no `window` field, so flag as needs-review only
 *   when older than 60 days; otherwise still-open.
 */
export function categorizeUnresolved(rec: Rec, platform: DerivedPlatform): UnresolvedCategory {
  if (platform === "price" || platform === "macro") {
    const deadline = parseWindowDeadline(rec);
    if (!deadline) return "still-open";
    const msUntil = deadline.getTime() - Date.now();
    if (msUntil <= 0) return "needs-review";
    if (msUntil <= SEVEN_DAYS_MS) return "approaching";
    return "still-open";
  }
  if (platform === "kalshi" || platform === "polymarket") {
    const ageMs = rec.createdAt ? Date.now() - new Date(rec.createdAt).getTime() : 0;
    if (ageMs > SIXTY_DAYS_MS) return "needs-review";
    return "still-open";
  }
  return "still-open";
}

// -------------------------- PRICE-BASED --------------------------

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

export function parseWindowDeadline(rec: Rec): Date | null {
  const w = (rec.window ?? "").toString().trim().toLowerCase();
  if (!w) return null;
  const created = rec.createdAt ? new Date(rec.createdAt) : new Date();

  // "By [Month] [Year]"
  const monthYear = w.match(/by\s+([a-z]+)\s+(\d{4})/);
  if (monthYear) {
    const monthIdx = MONTHS[monthYear[1]];
    const year = parseInt(monthYear[2], 10);
    if (monthIdx != null && Number.isFinite(year)) {
      // Last day of that month, end-of-day UTC
      return new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59));
    }
  }

  // "1 week" / "2 weeks"
  const wk = w.match(/(\d+)\s*week/);
  if (wk) {
    return new Date(created.getTime() + parseInt(wk[1], 10) * 7 * 86_400_000);
  }

  // "30 days" / "7 days"
  const dy = w.match(/(\d+)\s*day/);
  if (dy) {
    return new Date(created.getTime() + parseInt(dy[1], 10) * 86_400_000);
  }

  // "1 month" / "3 months"
  const mo = w.match(/(\d+)\s*month/);
  if (mo) {
    const d = new Date(created);
    d.setUTCMonth(d.getUTCMonth() + parseInt(mo[1], 10));
    return d;
  }

  if (w.includes("near-term") || w.includes("near term")) {
    return new Date(created.getTime() + 14 * 86_400_000);
  }

  return null;
}

export async function resolvePriceOutcome(rec: Rec): Promise<ResolutionResult> {
  const deadline = parseWindowDeadline(rec);
  if (!deadline) return { resolved: false };
  if (deadline.getTime() > Date.now()) return { resolved: false };

  // Look up current price from assets table — match by id first, else by symbol/title
  let currentPrice: number | null = null;
  let matchedSymbol: string | null = null;

  if (rec.assetId != null) {
    const [a] = await db
      .select({ id: assetsTable.id, symbol: assetsTable.symbol, currentPrice: assetsTable.currentPrice })
      .from(assetsTable)
      .where(eq(assetsTable.id, rec.assetId))
      .limit(1);
    if (a && typeof a.currentPrice === "number") {
      currentPrice = a.currentPrice;
      matchedSymbol = a.symbol;
    }
  }

  if (currentPrice == null) {
    // Try matching by ticker symbol embedded in the title, e.g. "Crude Oil (USO)"
    const titleMatch = (rec.assetTitle ?? "").match(/\(([A-Z]{1,8})\)/);
    if (titleMatch) {
      const sym = titleMatch[1];
      const [a] = await db
        .select({ id: assetsTable.id, symbol: assetsTable.symbol, currentPrice: assetsTable.currentPrice })
        .from(assetsTable)
        .where(eq(assetsTable.symbol, sym))
        .limit(1);
      if (a && typeof a.currentPrice === "number") {
        currentPrice = a.currentPrice;
        matchedSymbol = a.symbol;
      }
    }
  }

  if (currentPrice == null) return { resolved: false };

  // Determine the entry price for paper-return calculation.
  // rec.marketPrice sometimes stores the AI probability (0-100) rather than
  // the actual asset dollar price. Heuristic: if marketPrice equals
  // aiProbability (or is very close), it is almost certainly the AI
  // probability duplicated into the wrong field — reject it. Otherwise,
  // treat it as a genuine asset price snapshot captured at call time.
  let entryPrice: number | null = null;
  const mp = rec.marketPrice;
  const ap = rec.aiProbability;
  if (typeof mp === "number" && mp > 0) {
    const looksLikeAiProb =
      typeof ap === "number" && Math.abs(mp - ap) < 0.01;
    if (!looksLikeAiProb) {
      entryPrice = mp;
    }
  }

  const dir = normalizeDirection(rec.direction);
  if (dir !== "long" && dir !== "yes" && dir !== "short" && dir !== "no") {
    return { resolved: false };
  }

  // When entry price is available, compute outcome relative to entry/exit.
  // When missing, we still resolve directionally — a LONG call on an asset
  // whose current price is positive is treated as "correct" (price exists),
  // but paper return stays null since we lack the entry reference.
  let outcome: Outcome;
  if (entryPrice != null) {
    const flat = currentPrice > entryPrice * 0.995 && currentPrice < entryPrice * 1.005;
    if (dir === "long" || dir === "yes") {
      outcome = flat ? "partial" : currentPrice > entryPrice ? "correct" : "incorrect";
    } else {
      outcome = flat ? "partial" : currentPrice < entryPrice ? "correct" : "incorrect";
    }
  } else {
    // No entry price — cannot determine correct/incorrect from price move.
    // Leave unresolved so a human can review.
    logger.warn(`Paper return not calculated for rec #${rec.id} — missing entry price data`);
    return {
      resolved: true,
      outcome: undefined,
      resolutionDate: new Date(),
      note: `${matchedSymbol ?? rec.assetTitle ?? "asset"} exit price: $${currentPrice.toFixed(2)}. ` +
        `Direction: ${(rec.direction ?? "").toString().toUpperCase() || "—"}. ` +
        `Entry price unavailable — cannot determine outcome or paper return.`,
      marketPriceAtResolution: currentPrice,
      paperReturn: null,
    };
  }

  const rawPctChange = (currentPrice - entryPrice) / entryPrice;
  const directionMultiplier = dir === "short" || dir === "no" ? -1 : 1;
  const paperReturn = Math.round(
    rawPctChange * directionMultiplier * DEFAULT_PAPER_TRADE_USD * 100,
  ) / 100;

  const dirLabel = (rec.direction ?? "").toString().toUpperCase() || "—";
  const symLabel = matchedSymbol ?? rec.assetTitle ?? "asset";
  const note =
    `Entry price: $${entryPrice.toFixed(2)} (${symLabel} at call time), ` +
    `Exit price: $${currentPrice.toFixed(2)}, Direction: ${dirLabel}, ` +
    `Return: ${paperReturn >= 0 ? "+$" : "-$"}${Math.abs(paperReturn).toFixed(2)}`;

  return {
    resolved: true,
    outcome,
    resolutionDate: new Date(),
    note,
    marketPriceAtResolution: currentPrice,
    paperReturn,
  };
}

// -------------------------- ECONOMIC --------------------------

type MacroSeries = "cpi" | "unemployment" | "gdp" | "fedfunds" | null;

function detectMacroSeries(rec: Rec): MacroSeries {
  const t = lowerTitle(rec);
  if (t.includes("cpi") || t.includes("inflation")) return "cpi";
  if (t.includes("gdp")) return "gdp";
  if (t.includes("unemployment") || t.includes("payrolls") || t.includes("jobs")) return "unemployment";
  if (t.includes("fed funds") || t.includes("fomc") || t.includes("rate cut") || t.includes("rate hike")) return "fedfunds";
  return null;
}

export async function resolveEconomicOutcome(rec: Rec): Promise<ResolutionResult> {
  const series = detectMacroSeries(rec);
  if (!series) return { resolved: false };

  let currentValue: number | null = null;
  let label = "";

  if (series === "cpi") {
    const cpi = await fetchCPI();
    if (cpi) {
      currentValue = cpi.current.value;
      label = `CPI ${cpi.current.date}`;
    }
  } else if (series === "unemployment") {
    const u = await fetchUnemploymentRate();
    if (u) {
      currentValue = u.current.value;
      label = `Unemployment ${u.current.date}`;
    }
  } else if (series === "gdp") {
    const g = await fetchGDP();
    if (g) {
      currentValue = g.current;
      label = `GDP ${g.period}`;
    }
  } else if (series === "fedfunds") {
    const f = await getFedFundsRate();
    if (f) {
      currentValue = f.targetUpper;
      label = `Fed Funds (target upper) as of ${f.asOf || "latest"}`;
    }
  }

  if (currentValue == null) return { resolved: false };
  const entry = rec.marketPrice;
  if (typeof entry !== "number") return { resolved: false };

  const dir = normalizeDirection(rec.direction);
  let outcome: Outcome;
  if (dir === "long" || dir === "yes") {
    outcome = currentValue > entry ? "correct" : "incorrect";
  } else if (dir === "short" || dir === "no") {
    outcome = currentValue < entry ? "correct" : "incorrect";
  } else {
    return { resolved: false };
  }

  return {
    resolved: true,
    outcome,
    resolutionDate: new Date(),
    note: `${label}: ${currentValue} vs entry ${entry}. Direction was ${(rec.direction ?? "").toString().toUpperCase()}. Outcome: ${outcome}.`,
    marketPriceAtResolution: currentValue,
    paperReturn: null,
  };
}

// -------------------------- ORCHESTRATION --------------------------

export interface DigestEntry {
  id: number;
  assetTitle: string;
  outcome: Outcome;
  platform: DerivedPlatform;
}

export interface ResolutionDigest {
  date: string;
  resolvedToday: number;
  skipped: number;
  failed: number;
  stillOpen: number;
  approachingWindow: number;
  needsHumanReview: number;
  resolved: DigestEntry[];
  needsReviewIds: number[];
}

export async function runOutcomeResolution(): Promise<ResolutionDigest> {
  const startedAt = Date.now();
  logger.info("Starting daily outcome resolution...");

  const openCalls = await db
    .select()
    .from(recommendationsTable)
    .where(
      and(
        eq(recommendationsTable.type, "trade"),
        isNull(recommendationsTable.outcome),
      ),
    );

  let resolved = 0;
  let skipped = 0;
  let failed = 0;
  const resolvedEntries: DigestEntry[] = [];
  const needsReview: number[] = [];
  let approachingWindow = 0;

  // Helper: when a rec stays open (skipped, resolver-throw, or DB-update-fail)
  // categorize it so the digest tracks the same overdue/approaching counts the
  // leaderboard derives from the same data.
  function trackUnresolved(rec: Rec, platform: DerivedPlatform) {
    const cat = categorizeUnresolved(rec, platform);
    if (cat === "needs-review") needsReview.push(rec.id);
    else if (cat === "approaching") approachingWindow++;
  }

  for (const rec of openCalls) {
    const platform = derivePlatform(rec);
    let result: ResolutionResult = { resolved: false };
    try {
      if (platform === "kalshi") {
        result = await resolveKalshiOutcome(rec);
      } else if (platform === "polymarket") {
        result = await resolvePolymarketOutcome(rec);
      } else if (platform === "price") {
        result = await resolvePriceOutcome(rec);
      } else if (platform === "macro") {
        result = await resolveEconomicOutcome(rec);
      }
    } catch (err: any) {
      failed++;
      logger.error(
        { err: err?.message ?? err, recId: rec.id },
        `Failed to resolve rec #${rec.id}`,
      );
      // Rec stays open in DB after a resolver throw — categorize so the digest
      // reflects the same needs-review/approaching status leaderboard will see.
      trackUnresolved(rec, platform);
      continue;
    }

    if (result.resolved && result.outcome) {
      try {
        await db
          .update(recommendationsTable)
          .set({
            outcome: result.outcome,
            resolutionDate: result.resolutionDate ?? new Date(),
            resolutionNote: result.note ?? null,
            marketPriceAtResolution: result.marketPriceAtResolution ?? null,
            paperReturn: result.paperReturn ?? null,
            resolutionMethod: "auto",
          })
          .where(eq(recommendationsTable.id, rec.id));
        resolved++;
        resolvedEntries.push({
          id: rec.id,
          assetTitle: rec.assetTitle ?? rec.title ?? `#${rec.id}`,
          outcome: result.outcome,
          platform,
        });
        logger.info(
          `Resolved: rec #${rec.id} ${rec.assetTitle ?? rec.title} → ${result.outcome.toUpperCase()} (${platform})`,
        );
      } catch (err: any) {
        failed++;
        logger.error(
          { err: err?.message ?? err, recId: rec.id },
          `DB update failed for rec #${rec.id}`,
        );
        // DB write failed → rec stays open in DB. Categorize so the digest
        // matches what leaderboard will report on the same dataset.
        trackUnresolved(rec, platform);
      }
    } else {
      skipped++;
      trackUnresolved(rec, platform);
    }
  }

  // Failed rows are still open (the DB write blew up but the recommendation
  // remains unresolved), so they must NOT be subtracted from the open total.
  const stillOpen = openCalls.length - resolved;
  const todayIso = new Date().toISOString().slice(0, 10);

  const digest: ResolutionDigest = {
    date: todayIso,
    resolvedToday: resolved,
    skipped,
    failed,
    stillOpen,
    approachingWindow,
    needsHumanReview: needsReview.length,
    resolved: resolvedEntries,
    needsReviewIds: needsReview,
  };

  // Print a clearly-formatted digest the Manila team can read in console logs.
  const lines: string[] = [];
  lines.push(`Daily Resolution Report — ${todayIso}`);
  lines.push(`Resolved today: ${resolved}`);
  for (const e of resolvedEntries) {
    lines.push(`  - ${e.assetTitle} → ${e.outcome.toUpperCase()} (${e.platform})`);
  }
  lines.push(`Still open: ${stillOpen} calls`);
  lines.push(`Approaching window: ${approachingWindow} calls (resolve within 7 days)`);
  lines.push(
    `Needs human review: ${needsReview.length} calls (window passed, auto-resolution failed)`,
  );
  if (needsReview.length > 0) {
    lines.push(`  Review IDs: ${needsReview.join(", ")}`);
  }
  if (failed > 0) {
    lines.push(`Errors during resolution: ${failed}`);
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  lines.push(`Completed in ${elapsed}s`);

  logger.info("\n" + lines.join("\n"));

  return digest;
}
