import { db } from "@workspace/db";
import { liveTradesTable, pendingOrdersTable, recommendationsTable, tradesTable, assetsTable, userTradingAccountsTable } from "@workspace/db/schema";
import { desc, eq, gte, sql, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { decryptCredentials } from "./auth";

export type Platform = "kalshi" | "polymarket" | "alpaca" | "paper";
export type OrderSide = "YES" | "NO";

export interface RiskConfig {
  minEdge: number;
  minConfidence: number;
  maxPositionPct: number;
  maxDailyTrades: number;
  dailyLossLimitPct: number;
  requireApproval: boolean;
  usMode: boolean;
}

export const RISK: RiskConfig = {
  minEdge: parseFloat(process.env.MIN_EDGE_TO_EXECUTE ?? "5"),
  minConfidence: parseInt(process.env.MIN_CONFIDENCE ?? "65"),
  maxPositionPct: parseFloat(process.env.MAX_POSITION_PCT ?? "0.05"),
  maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES ?? "10"),
  dailyLossLimitPct: parseFloat(process.env.DAILY_LOSS_LIMIT_PCT ?? "0.10"),
  requireApproval: (process.env.REQUIRE_APPROVAL ?? "true").toLowerCase() === "true",
  usMode: (process.env.US_JURISDICTION_MODE ?? "true").toLowerCase() === "true",
};

const KALSHI_STRONG = [
  "fed", "federal reserve", "rate cut", "rate hike", "fomc",
  "cpi", "inflation", "pce", "core inflation",
  "unemployment", "payrolls", "jobs report", "nonfarm",
  "gdp", "recession", "growth",
  "election", "president", "senate", "congress", "governor",
  "bitcoin", "btc", "ethereum", "eth", "crypto price",
  "hurricane", "weather", "temperature",
  "oil price", "brent", "wti", "gas price",
  "sp500", "s&p", "nasdaq", "dow", "stock market",
  "earnings", "revenue", "guidance",
];

const POLYMARKET_ONLY = [
  "war", "invasion", "conflict", "ceasefire", "peace deal",
  "assassination", "coup", "sanctions",
  "nuclear", "missile", "military",
  "award", "oscar", "grammy", "prize",
  "crypto launch", "token", "defi", "nft",
  "sports", "championship", "world cup", "nba finals",
];

interface PlatformConfig {
  isConfigured: boolean;
}

function getPlatformStatus(): Record<string, PlatformConfig> {
  return {
    // TODO: Migrate to API key auth when Kalshi developer program supports it (KALSHI_API_KEY)
    kalshi: { isConfigured: !!(process.env.KALSHI_EMAIL && process.env.KALSHI_PASSWORD) },
    alpaca: { isConfigured: !!(process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY) },
    polymarket: { isConfigured: !!process.env.POLYMARKET_PRIVATE_KEY },
  };
}

export interface RoutingDecision {
  platform: Platform;
  reason: string;
  tradeable: boolean;
}

export async function getBestPlatform(
  rec: {
    title?: string | null;
    assetClass?: string | null;
    sector?: string | null;
  },
  userId?: number,
): Promise<RoutingDecision> {
  const title = (rec.title ?? "").toLowerCase();
  const assetClass = (rec.assetClass ?? "").toLowerCase();
  const sector = (rec.sector ?? "").toLowerCase();
  const envPlatforms = getPlatformStatus();
  // When a user is authenticated, ONLY their own user_trading_accounts row
  // counts as "configured" — env vars are an admin/no-user fallback only.
  // Without this, briefing.tsx receives `selectedPlatform: "paper"` from the
  // routing endpoint even when the user has Kalshi connected in /settings,
  // because env-var-only routing diverges from the per-user accounts the UI
  // already reads. (Bug #28: kept routing in lockstep with getAccountsStatus.)
  const userConfig = userId ? await getUserPlatformConfigured(userId) : null;
  const isConfigured = (key: "kalshi" | "alpaca" | "polymarket") =>
    userConfig != null ? !!userConfig[key] : envPlatforms[key].isConfigured;

  const isEquity =
    assetClass === "stock" || assetClass === "stocks" ||
    assetClass === "etf" || assetClass === "etfs" ||
    assetClass === "equity" || assetClass === "equities" ||
    sector === "stock" || sector === "stocks" ||
    sector === "equity" || sector === "equities";
  if (isEquity) {
    if (isConfigured("alpaca")) {
      return { platform: "alpaca", reason: "Stock/ETF market → Alpaca", tradeable: true };
    }
    return { platform: "paper", reason: "Alpaca not configured", tradeable: false };
  }

  const kalshiMatch = KALSHI_STRONG.some(kw => title.includes(kw));
  const polymarketOnlyMatch = POLYMARKET_ONLY.some(kw => title.includes(kw));

  if (kalshiMatch && !polymarketOnlyMatch) {
    if (isConfigured("kalshi")) {
      return { platform: "kalshi", reason: "Kalshi covers this market — CFTC regulated, USD settled", tradeable: true };
    }
    return { platform: "paper", reason: "Kalshi not configured", tradeable: false };
  }

  if (RISK.usMode) {
    if (isConfigured("kalshi")) {
      return { platform: "kalshi", reason: "US jurisdiction mode — routing to Kalshi (legal for US residents)", tradeable: true };
    }
    return { platform: "paper", reason: "US jurisdiction mode — Polymarket not available for US residents", tradeable: false };
  } else {
    if (polymarketOnlyMatch && isConfigured("polymarket")) {
      return { platform: "polymarket", reason: "Polymarket covers this market type (non-US jurisdiction)", tradeable: true };
    }
    if (isConfigured("kalshi")) {
      return { platform: "kalshi", reason: "Falling back to Kalshi (Polymarket not configured)", tradeable: true };
    }
    return { platform: "paper", reason: "No prediction market platform configured", tradeable: false };
  }
}

export interface RiskCheckResult {
  passed: boolean;
  reason: string;
}

export function checkRiskGate(
  rec: { edge?: number | null; confidence?: number | null },
  amountUsd: number,
  portfolioValue: number,
  dailyPnl: number,
  dailyTradeCount: number
): RiskCheckResult {
  const edge = Math.abs(rec.edge ?? 0);
  if (edge < RISK.minEdge) {
    return { passed: false, reason: `Edge ${edge.toFixed(1)} pts below minimum ${RISK.minEdge} pts` };
  }
  if ((rec.confidence ?? 0) < RISK.minConfidence) {
    return { passed: false, reason: `Confidence ${rec.confidence}% below minimum ${RISK.minConfidence}%` };
  }
  const maxAmount = portfolioValue * RISK.maxPositionPct;
  if (amountUsd > maxAmount && portfolioValue > 0) {
    return { passed: false, reason: `$${amountUsd.toFixed(0)} exceeds max position $${maxAmount.toFixed(0)} (${(RISK.maxPositionPct * 100).toFixed(0)}% of portfolio)` };
  }
  if (portfolioValue > 0) {
    const lossThreshold = -(portfolioValue * RISK.dailyLossLimitPct);
    if (dailyPnl < lossThreshold) {
      return { passed: false, reason: "Daily loss limit reached — trading paused" };
    }
  }
  if (dailyTradeCount >= RISK.maxDailyTrades) {
    return { passed: false, reason: `Daily trade limit (${RISK.maxDailyTrades}) reached` };
  }
  return { passed: true, reason: "All risk checks passed" };
}

export async function getDailyPnl(userId?: number): Promise<number> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const conds = [
      eq(tradesTable.status, "closed"),
      gte(tradesTable.closedAt, today),
    ];
    if (userId != null) conds.push(eq(tradesTable.userId, userId));
    const result = await db
      .select({ totalPnl: sql<number>`coalesce(sum(${tradesTable.pnl}), 0)` })
      .from(tradesTable)
      .where(and(...conds));
    return Number(result[0]?.totalPnl ?? 0);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "getDailyPnl failed, defaulting to 0");
    return 0;
  }
}

export async function getDailyTradeCount(userId?: number): Promise<number> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const conds = [gte(liveTradesTable.executedAt, today)];
    if (userId != null) conds.push(eq(liveTradesTable.userId, userId));
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(liveTradesTable)
      .where(and(...conds));
    return Number(result[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function getPendingOrderCount(userId?: number): Promise<number> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const conds = [
      eq(pendingOrdersTable.status, "pending_approval"),
      gte(pendingOrdersTable.createdAt, today),
    ];
    if (userId != null) conds.push(eq(pendingOrdersTable.userId, userId));
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(pendingOrdersTable)
      .where(and(...conds));
    return Number(result[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function resolveAssetIdString(rec: typeof recommendationsTable.$inferSelect): Promise<string> {
  if (rec.assetId != null) return String(rec.assetId);
  const title = (rec.assetTitle ?? "").trim();
  if (!title) return "";
  try {
    const candidates = await db.select().from(assetsTable);
    const lc = title.toLowerCase();
    const match = candidates.find(
      (a) =>
        a.name.toLowerCase() === lc ||
        a.symbol.toLowerCase() === lc ||
        lc.includes(a.name.toLowerCase()) ||
        lc.includes(a.symbol.toLowerCase())
    );
    return match ? String(match.id) : "";
  } catch {
    return "";
  }
}

export async function storePendingOrder(
  rec: typeof recommendationsTable.$inferSelect,
  amountUsd: number,
  platformOverride?: Platform,
  userId?: number,
) {
  const routing = await getBestPlatform(rec, userId);
  const assetIdStr = await resolveAssetIdString(rec);
  await db.insert(pendingOrdersTable).values({
    userId,
    recommendationId: rec.id,
    recTitle: rec.title,
    assetId: assetIdStr,
    direction: rec.direction ?? "YES",
    amountUsd,
    platform: platformOverride ?? routing.platform,
    platformReason: routing.reason,
    aiProbability: rec.aiProbability,
    edge: rec.edge,
    confidence: rec.confidence,
    status: "pending_approval",
  });
}

export async function logLiveTrade(
  rec: typeof recommendationsTable.$inferSelect,
  platform: Platform,
  amountUsd: number,
  direction: string,
  price?: number,
  size?: number,
  orderId?: string,
  userId?: number,
  status: string = "filled",
): Promise<number | undefined> {
  const ticker = rec.assetTitle ?? rec.title ?? "";
  const assetIdStr = await resolveAssetIdString(rec);

  let resolvedPrice = price;
  if (resolvedPrice == null && rec.assetId != null) {
    try {
      const [asset] = await db
        .select()
        .from(assetsTable)
        .where(eq(assetsTable.id, rec.assetId))
        .limit(1);
      if (asset?.currentPrice != null && asset.currentPrice > 0) {
        resolvedPrice = asset.currentPrice;
      }
    } catch {
      // ignore
    }
  }
  if (resolvedPrice == null || resolvedPrice <= 0) resolvedPrice = 1;

  const resolvedSize = size ?? (amountUsd > 0 ? amountUsd / resolvedPrice : 0);
  const resolvedOrderId = orderId ?? `ORDER-${Date.now()}-${rec.id}`;

  try {
    const [inserted] = await db
      .insert(liveTradesTable)
      .values({
        userId,
        recommendationId: rec.id,
        platform,
        assetId: assetIdStr,
        assetTitle: rec.assetTitle ?? rec.title,
        direction,
        amountUsd,
        price: resolvedPrice,
        size: resolvedSize,
        status,
        paperMode: platform === "paper",
        aiProbability: rec.aiProbability,
        aiEdge: rec.edge,
        confidence: rec.confidence,
        orderId: resolvedOrderId,
        ticker,
      })
      .returning({ id: liveTradesTable.id });
    logger.info(
      {
        liveTradeId: inserted?.id,
        userId,
        recommendationId: rec.id,
        platform,
        status,
        amountUsd,
      },
      "logLiveTrade: live_trades row inserted",
    );
    return inserted?.id;
  } catch (e: any) {
    logger.error(
      {
        err: e?.message,
        userId,
        recommendationId: rec.id,
        platform,
        status,
        amountUsd,
      },
      "logLiveTrade: insert failed",
    );
    throw e;
  }
}

export async function getUserCredentials(
  userId: number,
  platform: string,
): Promise<Record<string, unknown> | null> {
  try {
    const [row] = await db
      .select()
      .from(userTradingAccountsTable)
      .where(
        and(
          eq(userTradingAccountsTable.userId, userId),
          eq(userTradingAccountsTable.platform, platform),
        ),
      )
      .limit(1);
    if (!row) return null;
    return decryptCredentials(row.encryptedCredentials);
  } catch (e) {
    logger.error({ err: (e as any)?.message, userId, platform }, "decrypt user credentials failed");
    return null;
  }
}

async function getUserPlatformConfigured(userId: number): Promise<Record<string, boolean>> {
  const rows = await db
    .select({ platform: userTradingAccountsTable.platform })
    .from(userTradingAccountsTable)
    .where(eq(userTradingAccountsTable.userId, userId));
  const out: Record<string, boolean> = { kalshi: false, alpaca: false, polymarket: false };
  for (const r of rows) out[r.platform] = true;
  return out;
}

export async function getAccountsStatus(userId?: number) {
  const platforms = getPlatformStatus();
  const usMode = RISK.usMode;
  const userConfig = userId ? await getUserPlatformConfigured(userId) : null;
  // When a user is authenticated, ONLY their own user_trading_accounts row
  // determines configuration. Env vars (KALSHI_EMAIL, etc.) are an admin/no-user
  // fallback only — using them for a logged-in user produces inconsistent UI
  // (Bug #28: per-user platforms looked configured because env was set globally).
  const isConfigured = (key: "kalshi" | "alpaca" | "polymarket") => {
    if (userConfig != null) return !!userConfig[key];
    return platforms[key].isConfigured;
  };

  return {
    usJurisdictionMode: usMode,
    primaryPlatform: "kalshi",
    note: usMode
      ? "US jurisdiction mode ON — Kalshi is your primary platform. Polymarket is available for research/paper trading only."
      : "Non-US mode — Kalshi primary, Polymarket secondary for unsupported markets.",
    kalshi: isConfigured("kalshi")
      ? {
          status: "configured",
          legalStatus: "CFTC regulated — legal for US residents in all 50 states",
          depositMethod: "USD wire / bank transfer",
        }
      : {
          status: "not_configured",
          message: "Add KALSHI_EMAIL and KALSHI_PASSWORD to Secrets",
          priority: "PRIMARY — set this up first",
          legalStatus: "CFTC regulated — legal for US residents",
        },
    alpaca: isConfigured("alpaca")
      ? {
          status: "configured",
          legalStatus: "SEC/FINRA regulated — legal for US residents",
          assetTypes: "US stocks and ETFs",
        }
      : {
          status: "not_configured",
          message: "Add ALPACA_API_KEY and ALPACA_SECRET_KEY to Secrets",
          priority: "SECONDARY — for stock/ETF recommendations",
        },
    polymarket: isConfigured("polymarket")
      ? {
          status: "configured",
          legalStatus: usMode
            ? "PAPER TRADING ONLY (US jurisdiction mode ON)"
            : "Live trading enabled (non-US jurisdiction)",
          depositMethod: "USDC on Polygon blockchain",
        }
      : {
          status: "not_configured",
          legalStatus: usMode
            ? "PAPER TRADING ONLY (US jurisdiction mode ON)"
            : "Available",
          message: "Not required for US residents — Kalshi covers the same markets",
        },
  };
}
