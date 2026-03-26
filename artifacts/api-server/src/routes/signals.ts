import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  GetSignalsParams,
  GetSignalsQueryParams,
  GetSignalsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/feed/latest", async (_req, res) => {
  try {
    const signals = await db
      .select()
      .from(signalsTable)
      .orderBy(desc(signalsTable.createdAt))
      .limit(20);

    const data = GetSignalsResponse.parse({
      signals: signals.map((s) => ({
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
      })),
      total: signals.length,
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:assetId", async (req, res) => {
  try {
    const { assetId } = GetSignalsParams.parse(req.params);
    const query = GetSignalsQueryParams.parse(req.query);

    const signals = await db
      .select()
      .from(signalsTable)
      .where(eq(signalsTable.assetId, assetId))
      .orderBy(desc(signalsTable.createdAt))
      .limit(query.limit);

    const data = GetSignalsResponse.parse({
      signals: signals.map((s) => ({
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
      })),
      total: signals.length,
    });
    res.json(data);
  } catch (e: any) {
    req.log.error({ err: e }, "Error getting signals");
    res.status(500).json({ error: e.message });
  }
});

export default router;
