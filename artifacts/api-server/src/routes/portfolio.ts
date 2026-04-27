import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tradesTable, portfolioTable, assetsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  OpenTradeBody,
  CloseTradeParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_STARTING_BALANCE = 10000;

function buildTradeReasoning(asset: typeof assetsTable.$inferSelect, direction: string, entryPrice: number): string {
  const parts: string[] = [];
  parts.push(`Manual ${direction.toUpperCase()} entry on ${asset.name} (${asset.symbol}) @ $${entryPrice.toFixed(2)}.`);
  if (asset.aiProbability != null && asset.marketProbability != null && asset.edge != null) {
    parts.push(
      `AI prob ${(asset.aiProbability * 100).toFixed(1)}% vs market ${(asset.marketProbability * 100).toFixed(1)}% (edge ${asset.edge >= 0 ? "+" : ""}${asset.edge.toFixed(1)} pts).`
    );
  }
  if (asset.aiSummary) parts.push(asset.aiSummary);
  return parts.join(" ");
}

async function getOrCreatePortfolio(userId: number) {
  const [existing] = await db
    .select()
    .from(portfolioTable)
    .where(eq(portfolioTable.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(portfolioTable)
    .values({
      userId,
      balance: DEFAULT_STARTING_BALANCE,
      initialBalance: DEFAULT_STARTING_BALANCE,
    })
    .returning();
  return created;
}

router.get("/", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const portfolio = await getOrCreatePortfolio(userId);

    const openTrades = await db
      .select()
      .from(tradesTable)
      .where(and(eq(tradesTable.userId, userId), eq(tradesTable.status, "open")))
      .orderBy(desc(tradesTable.openedAt));

    const closedTrades = await db
      .select()
      .from(tradesTable)
      .where(and(eq(tradesTable.userId, userId), eq(tradesTable.status, "closed")))
      .orderBy(desc(tradesTable.closedAt))
      .limit(20);

    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const displayBalance = Math.floor(portfolio.balance * 100) / 100;

    res.json({
      balance: displayBalance,
      initialBalance: portfolio.initialBalance,
      totalPnl,
      totalPnlPercent:
        portfolio.initialBalance > 0
          ? (totalPnl / portfolio.initialBalance) * 100
          : 0,
      openTrades: openTrades.map(formatTrade),
      closedTrades: closedTrades.map(formatTrade),
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting portfolio");
    res.status(500).json({ error: e.message });
  }
});

router.post("/trade", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const body = OpenTradeBody.parse(req.body);
    const portfolio = await getOrCreatePortfolio(userId);


    if (body.amount > portfolio.balance) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const [asset] = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.id, body.assetId))
      .limit(1);

    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const entryPrice = asset.currentPrice ?? 0;
    const quantity = entryPrice > 0 ? body.amount / entryPrice : body.amount;

    const [trade] = await db
      .insert(tradesTable)
      .values({
        userId,
        assetId: body.assetId,
        assetName: asset.name,
        assetSymbol: asset.symbol,
        direction: body.direction,
        entryPrice,
        quantity,
        status: "open",
        aiReasoning: buildTradeReasoning(asset, body.direction, entryPrice),
      })
      .returning();

    const newBalance = portfolio.balance - body.amount;
    await db
      .update(portfolioTable)
      .set({ balance: newBalance })
      .where(eq(portfolioTable.id, portfolio.id));

    res.json({
      trade: formatTrade(trade),
      balance: newBalance,
      message: `Opened ${body.direction} position on ${asset.name} for $${body.amount.toFixed(2)}`,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error opening trade");
    res.status(500).json({ error: e.message });
  }
});

router.post("/trade/:id/close", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { id } = CloseTradeParams.parse(req.params);

    const [trade] = await db
      .select()
      .from(tradesTable)
      .where(and(eq(tradesTable.id, id), eq(tradesTable.userId, userId)))
      .limit(1);

    if (!trade) {
      res.status(404).json({ error: "Trade not found" });
      return;
    }

    if (trade.status === "closed") {
      res.status(400).json({ error: "Trade already closed" });
      return;
    }

    const [asset] = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.id, trade.assetId))
      .limit(1);

    const exitPrice = asset?.currentPrice ?? trade.entryPrice;
    const priceDiff = exitPrice - trade.entryPrice;
    const pnl =
      trade.direction === "long"
        ? priceDiff * trade.quantity
        : -priceDiff * trade.quantity;
    const pnlPercent =
      trade.entryPrice > 0 ? (priceDiff / trade.entryPrice) * 100 : 0;

    const [closedTrade] = await db
      .update(tradesTable)
      .set({
        status: "closed",
        exitPrice,
        pnl,
        pnlPercent: trade.direction === "long" ? pnlPercent : -pnlPercent,
        closedAt: new Date(),
      })
      .where(eq(tradesTable.id, id))
      .returning();

    const portfolio = await getOrCreatePortfolio(userId);
    const returnedAmount = trade.entryPrice * trade.quantity + pnl;
    const newBalance = portfolio.balance + returnedAmount;
    await db
      .update(portfolioTable)
      .set({ balance: newBalance })
      .where(eq(portfolioTable.id, portfolio.id));

    res.json({
      trade: formatTrade(closedTrade),
      balance: newBalance,
      message: `Closed ${trade.direction} on ${trade.assetName}. PnL: $${pnl.toFixed(2)}`,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error closing trade");
    res.status(500).json({ error: e.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const portfolio = await getOrCreatePortfolio(userId);

    const allTrades = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.userId, userId));
    const closedTrades = allTrades.filter((t) => t.status === "closed");
    const winners = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const pnls = closedTrades.map((t) => t.pnl ?? 0);

    res.json({
      totalTrades: allTrades.length,
      winRate:
        closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0,
      avgReturn:
        closedTrades.length > 0
          ? closedTrades.reduce((s, t) => s + (t.pnlPercent ?? 0), 0) /
            closedTrades.length
          : 0,
      bestTrade: pnls.length > 0 ? Math.max(...pnls) : null,
      worstTrade: pnls.length > 0 ? Math.min(...pnls) : null,
      sharpeRatio: null,
      balance: Math.floor(portfolio.balance * 100) / 100,
      totalPnl,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting stats");
    res.status(500).json({ error: e.message });
  }
});

function formatTrade(t: typeof tradesTable.$inferSelect) {
  return {
    id: t.id,
    assetId: t.assetId,
    assetName: t.assetName,
    assetSymbol: t.assetSymbol,
    direction: t.direction,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    quantity: t.quantity,
    pnl: t.pnl,
    pnlPercent: t.pnlPercent,
    status: t.status,
    aiReasoning: t.aiReasoning,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
  };
}

export default router;
