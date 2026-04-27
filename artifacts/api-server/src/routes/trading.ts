import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { liveTradesTable, pendingOrdersTable, recommendationsTable } from "@workspace/db/schema";
import { eq, desc, gte, and } from "drizzle-orm";
import {
  getBestPlatform,
  checkRiskGate,
  getDailyTradeCount,
  getDailyPnl,
  getPendingOrderCount,
  storePendingOrder,
  logLiveTrade,
  getAccountsStatus,
  RISK,
} from "../services/platform-router";

const router: IRouter = Router();

router.get("/accounts", async (req, res) => {
  try {
    const accounts = await getAccountsStatus(req.user?.userId);
    res.json({ accounts });
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting accounts");
    res.status(500).json({ error: e.message });
  }
});

router.get("/route/:recommendationId", async (req, res) => {
  try {
    const id = Number(req.params.recommendationId);
    const [rec] = await db
      .select()
      .from(recommendationsTable)
      .where(eq(recommendationsTable.id, id))
      .limit(1);

    if (!rec) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }

    const routing = getBestPlatform(rec);
    res.json({
      recommendationId: id,
      title: rec.title,
      selectedPlatform: routing.platform,
      reason: routing.reason,
      tradeable: routing.tradeable,
      usJurisdictionMode: RISK.usMode,
      requireApproval: RISK.requireApproval,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting routing decision");
    res.status(500).json({ error: e.message });
  }
});

router.post("/execute", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { recommendationId, amountUsd, platform: platformOverride, overrideApproval } = req.body;

    const [rec] = await db
      .select()
      .from(recommendationsTable)
      .where(eq(recommendationsTable.id, Number(recommendationId)))
      .limit(1);

    if (!rec) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }

    const dailyTradeCount = await getDailyTradeCount(userId);
    const dailyPnl = await getDailyPnl(userId);
    const pendingCount = await getPendingOrderCount(userId);
    if (dailyTradeCount + pendingCount >= RISK.maxDailyTrades) {
      res.status(400).json({
        success: false,
        error: `Daily trade limit (${RISK.maxDailyTrades}) would be exceeded`,
        platform: "paper",
      });
      return;
    }
    const riskResult = checkRiskGate(rec, amountUsd, 10000, dailyPnl, dailyTradeCount);
    if (!riskResult.passed) {
      res.json({
        success: false,
        error: `Risk gate blocked: ${riskResult.reason}`,
        platform: "paper",
      });
      return;
    }

    if (RISK.requireApproval && !overrideApproval) {
      await storePendingOrder(rec, amountUsd, platformOverride, userId);
      res.json({
        success: false,
        error: "Order queued for your approval. Go to Trading → Pending to confirm.",
        platform: platformOverride ?? "paper",
        status: "pending_approval",
      });
      return;
    }

    const routing = getBestPlatform(rec);
    const selectedPlatform = platformOverride ?? routing.platform;

    if (selectedPlatform === "paper" || !routing.tradeable) {
      await logLiveTrade(rec, "paper", amountUsd, rec.direction ?? "YES", undefined, undefined, undefined, userId);
      res.json({
        success: true,
        platform: "paper",
        message: `Paper trade executed: $${amountUsd} on ${rec.title}`,
        reason: routing.reason,
      });
      return;
    }

    await logLiveTrade(rec, "paper", amountUsd, rec.direction ?? "YES", undefined, undefined, undefined, userId);
    res.json({
      success: true,
      platform: "paper",
      message: `${selectedPlatform} not configured — executed as paper trade: $${amountUsd} on ${rec.title}`,
      reason: routing.reason,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error executing trade");
    res.status(500).json({ error: e.message });
  }
});

router.get("/pending", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const pending = await db
      .select()
      .from(pendingOrdersTable)
      .where(
        and(
          eq(pendingOrdersTable.userId, userId),
          eq(pendingOrdersTable.status, "pending_approval"),
        ),
      )
      .orderBy(desc(pendingOrdersTable.createdAt));
    res.json({ pending });
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting pending orders");
    res.status(500).json({ error: e.message });
  }
});

router.post("/pending/:id/approve", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    const [order] = await db
      .select()
      .from(pendingOrdersTable)
      .where(and(eq(pendingOrdersTable.id, id), eq(pendingOrdersTable.userId, userId)))
      .limit(1);

    if (!order) {
      res.status(404).json({ error: "Pending order not found" });
      return;
    }

    if (order.status !== "pending_approval") {
      res.json({ status: order.status, orderId: id, message: `Order already ${order.status}` });
      return;
    }

    const dailyCount = await getDailyTradeCount(userId);
    if (dailyCount >= RISK.maxDailyTrades) {
      res.status(400).json({
        error: `Daily trade limit (${RISK.maxDailyTrades}) reached — approval blocked`,
      });
      return;
    }

    if (order.recommendationId) {
      const [rec] = await db
        .select()
        .from(recommendationsTable)
        .where(eq(recommendationsTable.id, order.recommendationId))
        .limit(1);

      if (rec) {
        const selectedPlatform = (order.platform as any) ?? "paper";
        await logLiveTrade(
          rec,
          selectedPlatform,
          req.body.amountOverride ?? order.amountUsd,
          order.direction ?? "YES",
          undefined,
          undefined,
          undefined,
          userId,
        );
      }
    }

    await db
      .update(pendingOrdersTable)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(pendingOrdersTable.id, id));

    res.json({ status: "approved", orderId: id });
  } catch (e: any) {
    req.log.error({ err: e }, "Error approving order");
    res.status(500).json({ error: e.message });
  }
});

router.post("/pending/:id/reject", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    const [order] = await db
      .select()
      .from(pendingOrdersTable)
      .where(and(eq(pendingOrdersTable.id, id), eq(pendingOrdersTable.userId, userId)))
      .limit(1);
    if (!order) {
      res.status(404).json({ error: "Pending order not found" });
      return;
    }
    await db
      .update(pendingOrdersTable)
      .set({ status: "rejected", rejectedAt: new Date() })
      .where(eq(pendingOrdersTable.id, id));
    res.json({ status: "rejected", orderId: id });
  } catch (e: any) {
    req.log.error({ err: e }, "Error rejecting order");
    res.status(500).json({ error: e.message });
  }
});

router.get("/history", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const platformFilter = req.query.platform as string | undefined;

    const conds = [eq(liveTradesTable.userId, userId)];
    if (platformFilter) conds.push(eq(liveTradesTable.platform, platformFilter));

    const trades = await db
      .select()
      .from(liveTradesTable)
      .where(and(...conds))
      .orderBy(desc(liveTradesTable.executedAt))
      .limit(limit);

    res.json({ trades });
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting trade history");
    res.status(500).json({ error: e.message });
  }
});

router.get("/positions", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const positions = await db
      .select()
      .from(liveTradesTable)
      .where(
        and(
          eq(liveTradesTable.userId, userId),
          eq(liveTradesTable.status, "filled"),
        ),
      )
      .orderBy(desc(liveTradesTable.executedAt));
    res.json({ positions });
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting positions");
    res.status(500).json({ error: e.message });
  }
});

export default router;
