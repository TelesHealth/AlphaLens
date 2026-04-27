import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  recommendationsTable,
  globalEventsTable,
  watchlistTable,
  dailyBriefingsTable,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  scanForRecommendations,
  getCurrentBriefing,
} from "../services/recommendations";

const router: IRouter = Router();

router.get("/briefing", async (req, res) => {
  try {
    const briefing = await getCurrentBriefing();
    if (!briefing) {
      res.json({
        summary:
          "No briefing available yet. Trigger a scan to generate your first intelligence briefing.",
        recommendations: [],
        globalEvents: [],
        tradeCount: 0,
        watchCount: 0,
        signalsProcessed: 0,
        scanNumber: 0,
        generatedAt: new Date(),
      });
      return;
    }
    res.json(briefing);
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting briefing");
    res.status(500).json({ error: e.message });
  }
});

router.post("/scan", async (req, res) => {
  try {
    res.json({
      status: "scan_started",
      message: "Scanning global markets... results will appear in briefing shortly.",
    });

    scanForRecommendations().catch((e) => {
      req.log.error({ err: e }, "Background scan failed");
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error starting scan");
    res.status(500).json({ error: e.message });
  }
});

router.get("/recommendations", async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    const urgency = req.query.urgency as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    let query = db
      .select()
      .from(recommendationsTable)
      .orderBy(desc(recommendationsTable.confidence))
      .limit(limit);

    const recs = await query;
    const filtered = recs.filter((r) => {
      if (type && r.type !== type) return false;
      if (urgency && r.urgency !== urgency) return false;
      return true;
    });

    res.json({ recommendations: filtered });
  } catch (e: any) {
    req.log.error({ err: e }, "Error listing recommendations");
    res.status(500).json({ error: e.message });
  }
});

router.get("/events", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const events = await db
      .select()
      .from(globalEventsTable)
      .orderBy(desc(globalEventsTable.scannedAt))
      .limit(limit);
    res.json({ events });
  } catch (e: any) {
    req.log.error({ err: e }, "Error listing events");
    res.status(500).json({ error: e.message });
  }
});

router.get("/watchlist", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const items = await db
      .select()
      .from(watchlistTable)
      .where(eq(watchlistTable.userId, userId))
      .orderBy(desc(watchlistTable.addedAt));
    res.json({ watchlist: items });
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting watchlist");
    res.status(500).json({ error: e.message });
  }
});

router.post("/watchlist", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { assetId, assetTitle, assetClass, alertEdgeThreshold, notes } = req.body;
    const [item] = await db
      .insert(watchlistTable)
      .values({
        userId,
        assetId,
        assetTitle: assetTitle ?? "",
        assetClass: assetClass ?? "",
        alertEdgeThreshold: alertEdgeThreshold ?? 5.0,
        notes: notes ?? "",
      })
      .returning();
    res.json({ status: "added", item });
  } catch (e: any) {
    req.log.error({ err: e }, "Error adding to watchlist");
    res.status(500).json({ error: e.message });
  }
});

router.delete("/watchlist/:id", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db
      .select({ id: watchlistTable.id })
      .from(watchlistTable)
      .where(and(eq(watchlistTable.id, id), eq(watchlistTable.userId, userId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Watchlist item not found" });
      return;
    }
    await db
      .delete(watchlistTable)
      .where(and(eq(watchlistTable.id, id), eq(watchlistTable.userId, userId)));
    res.json({ status: "removed" });
  } catch (e: any) {
    req.log.error({ err: e }, "Error removing from watchlist");
    res.status(500).json({ error: e.message });
  }
});

export default router;
