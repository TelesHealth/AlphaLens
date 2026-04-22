import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { assetsTable, signalsTable } from "@workspace/db/schema";
import { eq, desc, asc, sql, ilike, and } from "drizzle-orm";
import {
  ListMarketsQueryParams,
  GetMarketParams,
  ScoreMarketParams,
} from "@workspace/api-zod";
import { scoreMarketWithAI } from "../services/scoring";
import { refreshAllMarketData } from "../services/market-data";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const query = ListMarketsQueryParams.parse(req.query);
    const conditions = [];
    if (query.sector) {
      conditions.push(eq(assetsTable.sector, query.sector));
    }

    const orderCol =
      query.sort === "price_change"
        ? assetsTable.priceChange24h
        : query.sort === "name"
          ? assetsTable.name
          : assetsTable.alphaScore;

    const orderDir = query.sort === "name" ? asc(orderCol) : desc(orderCol);

    const markets = await db
      .select()
      .from(assetsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderDir)
      .limit(query.limit ?? 50);

    const total = markets.length;

    res.json({
      markets: markets.map(formatMarket),
      total,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error listing markets");
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = GetMarketParams.parse(req.params);

    const [market] = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.id, id))
      .limit(1);

    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    const signals = await db
      .select()
      .from(signalsTable)
      .where(eq(signalsTable.assetId, id))
      .orderBy(desc(signalsTable.createdAt))
      .limit(20);

    const relatedMarkets = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.sector, market.sector))
      .limit(5);

    res.json({
      market: formatMarket(market),
      signals: signals.map(formatSignal),
      relatedMarkets: relatedMarkets
        .filter((m) => m.id !== market.id)
        .map(formatMarket),
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting market");
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/score", async (req, res) => {
  try {
    const { id } = ScoreMarketParams.parse(req.params);

    const [market] = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.id, id))
      .limit(1);

    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    const result = await scoreMarketWithAI(market);

    const signals = await db
      .select()
      .from(signalsTable)
      .where(eq(signalsTable.assetId, id))
      .orderBy(desc(signalsTable.createdAt))
      .limit(20);

    res.json({
      market: formatMarket(result.market),
      signals: signals.map(formatSignal),
      scoring: result.scoring,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error scoring market");
    res.status(500).json({ error: e.message });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const result = await refreshAllMarketData(true);
    if (typeof result === "object" && "skipped" in result) {
      res.json({ status: "refresh_already_running", refreshed: 0, message: "A market refresh is already in progress." });
      return;
    }
    res.json({
      refreshed: result,
      message: `Refreshed ${result} markets with live data`,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error refreshing markets");
    res.status(500).json({ error: e.message });
  }
});

function formatMarket(m: typeof assetsTable.$inferSelect) {
  return {
    id: m.id,
    name: m.name,
    symbol: m.symbol,
    sector: m.sector,
    currentPrice: m.currentPrice,
    priceChange24h: m.priceChange24h,
    alphaScore: m.alphaScore,
    aiProbability: m.aiProbability,
    marketProbability: m.marketProbability,
    edge: m.edge,
    direction: m.direction,
    lastScoredAt: m.lastScoredAt ?? null,
    aiSummary: m.aiSummary,
    tradingBloc: m.tradingBloc,
    riskLevel: m.riskLevel,
    updatedAt: m.updatedAt,
  };
}

function formatSignal(s: typeof signalsTable.$inferSelect) {
  return {
    id: s.id,
    assetId: s.assetId,
    type: s.type,
    source: s.source,
    headline: s.headline,
    detail: s.detail,
    impact: s.impact,
    direction: s.direction,
    confidence: s.confidence,
    createdAt: s.createdAt,
  };
}

export default router;
