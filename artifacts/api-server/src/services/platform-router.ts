import { db } from "@workspace/db";
import { liveTradesTable, pendingOrdersTable, recommendationsTable } from "@workspace/db/schema";
import { desc, eq, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

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

export function getBestPlatform(rec: {
  title?: string | null;
  assetClass?: string | null;
  sector?: string | null;
}): RoutingDecision {
  const title = (rec.title ?? "").toLowerCase();
  const assetClass = (rec.assetClass ?? "").toLowerCase() ?? undefined;
  const sector = (rec.sector ?? "").toLowerCase();
  const platforms = getPlatformStatus();

  if (assetClass === "stock" || assetClass === "etf" || sector === "equity" || sector === "stock") {
    if (platforms.alpaca.isConfigured) {
      return { platform: "alpaca", reason: "Stock/ETF market → Alpaca", tradeable: true };
    }
    return { platform: "paper", reason: "Alpaca not configured (add ALPACA_API_KEY)", tradeable: false };
  }

  const kalshiMatch = KALSHI_STRONG.some(kw => title.includes(kw));
  const polymarketOnlyMatch = POLYMARKET_ONLY.some(kw => title.includes(kw));

  if (kalshiMatch && !polymarketOnlyMatch) {
    if (platforms.kalshi.isConfigured) {
      return { platform: "kalshi", reason: "Kalshi covers this market — CFTC regulated, USD settled", tradeable: true };
    }
    return { platform: "paper", reason: "Kalshi not configured (add KALSHI_EMAIL + KALSHI_PASSWORD)", tradeable: false };
  }

  if (RISK.usMode) {
    if (platforms.kalshi.isConfigured) {
      return { platform: "kalshi", reason: "US jurisdiction mode — routing to Kalshi (legal for US residents)", tradeable: true };
    }
    return { platform: "paper", reason: "US jurisdiction mode — Polymarket not available for US residents", tradeable: false };
  } else {
    if (polymarketOnlyMatch && platforms.polymarket.isConfigured) {
      return { platform: "polymarket", reason: "Polymarket covers this market type (non-US jurisdiction)", tradeable: true };
    }
    if (platforms.kalshi.isConfigured) {
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

export async function getDailyTradeCount(): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(liveTradesTable)
      .where(gte(liveTradesTable.executedAt, today));
    return Number(result[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function storePendingOrder(
  rec: typeof recommendationsTable.$inferSelect,
  amountUsd: number,
  platformOverride?: Platform
) {
  const routing = getBestPlatform(rec);
  await db.insert(pendingOrdersTable).values({
    recommendationId: rec.id,
    recTitle: rec.title,
    assetId: String(rec.assetId ?? ""),
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
  orderId?: string
) {
  await db.insert(liveTradesTable).values({
    recommendationId: rec.id,
    platform,
    assetId: String(rec.assetId ?? ""),
    assetTitle: rec.assetTitle ?? rec.title,
    direction,
    amountUsd,
    price,
    size,
    status: "filled",
    paperMode: platform === "paper",
    aiProbability: rec.aiProbability,
    aiEdge: rec.edge,
    confidence: rec.confidence,
    orderId,
  });
}

export function getAccountsStatus() {
  const platforms = getPlatformStatus();
  const usMode = RISK.usMode;

  return {
    usJurisdictionMode: usMode,
    primaryPlatform: "kalshi",
    note: usMode
      ? "US jurisdiction mode ON — Kalshi is your primary platform. Polymarket is available for research/paper trading only."
      : "Non-US mode — Kalshi primary, Polymarket secondary for unsupported markets.",
    kalshi: platforms.kalshi.isConfigured
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
    alpaca: platforms.alpaca.isConfigured
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
    polymarket: platforms.polymarket.isConfigured
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
