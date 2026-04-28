import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recommendationsTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

const TRACK_RECORD_START = new Date("2026-04-22T00:00:00.000Z");
const TRACK_RECORD_END = new Date("2026-07-22T00:00:00.000Z");
const TRACK_RECORD_TOTAL_DAYS = 90;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const typeFilter = (req.query.type as string | undefined) ?? "all";
    const statusFilter = (req.query.status as string | undefined) ?? "all";

    const all = await db
      .select()
      .from(recommendationsTable)
      .orderBy(desc(recommendationsTable.createdAt));

    const resolvedAll = all.filter((r) => r.outcome != null);
    const openAll = all.filter((r) => r.outcome == null);

    const correctCalls = resolvedAll.filter((r) => r.outcome === "correct").length;
    const incorrectCalls = resolvedAll.filter((r) => r.outcome === "incorrect").length;
    const partialCalls = resolvedAll.filter((r) => r.outcome === "partial").length;

    const totalCalls = all.length;
    const resolvedCalls = resolvedAll.length;
    const openCalls = openAll.length;

    const winRate =
      resolvedCalls > 0 ? round1((correctCalls / resolvedCalls) * 100) : 0;
    const winRateWithPartial =
      resolvedCalls > 0
        ? round1(((correctCalls + partialCalls * 0.5) / resolvedCalls) * 100)
        : 0;

    const edgeValues = all
      .map((r) => r.edge)
      .filter((v): v is number => typeof v === "number");
    const probValues = all
      .map((r) => r.aiProbability)
      .filter((v): v is number => typeof v === "number");
    const avgEdge =
      edgeValues.length > 0
        ? round1(edgeValues.reduce((a, b) => a + b, 0) / edgeValues.length)
        : 0;
    const avgAiProbability =
      probValues.length > 0
        ? round1(probValues.reduce((a, b) => a + b, 0) / probValues.length)
        : 0;

    const paperReturns = resolvedAll
      .map((r) => r.paperReturn)
      .filter((v): v is number => typeof v === "number");
    const totalPaperReturn = round1(paperReturns.reduce((a, b) => a + b, 0));
    // Paper return % is total return as % of capital deployed — assumes a hypothetical
    // $100 paper trade per RESOLVED call (a resolved call with null paperReturn
    // contributes $0 to the numerator but still occupies $100 of deployed capital,
    // so it correctly drags the percentage toward zero rather than inflating it).
    const capitalDeployed = resolvedCalls * 100;
    const paperReturnPct =
      capitalDeployed > 0
        ? round1((totalPaperReturn / capitalDeployed) * 100)
        : 0;

    // High-confidence subset (confidence > 75)
    const highConfResolved = resolvedAll.filter(
      (r) => typeof r.confidence === "number" && r.confidence > 75,
    );
    const highConfidenceWinRate =
      highConfResolved.length > 0
        ? round1(
            (highConfResolved.filter((r) => r.outcome === "correct").length /
              highConfResolved.length) *
              100,
          )
        : null;

    const highEdgeResolved = resolvedAll.filter(
      (r) => typeof r.edge === "number" && r.edge > 20,
    );
    const highEdgeWinRate =
      highEdgeResolved.length > 0
        ? round1(
            (highEdgeResolved.filter((r) => r.outcome === "correct").length /
              highEdgeResolved.length) *
              100,
          )
        : null;

    // Calibration buckets by AI probability
    const buckets: Array<{ key: string; min: number; max: number }> = [
      { key: "60-69%", min: 60, max: 70 },
      { key: "70-79%", min: 70, max: 80 },
      { key: "80%+", min: 80, max: 101 },
    ];
    const calibration = buckets.map((b) => {
      const inBucket = resolvedAll.filter(
        (r) =>
          typeof r.aiProbability === "number" &&
          r.aiProbability >= b.min &&
          r.aiProbability < b.max,
      );
      const correct = inBucket.filter((r) => r.outcome === "correct").length;
      const rate =
        inBucket.length > 0 ? round1((correct / inBucket.length) * 100) : 0;
      return { bucket: b.key, calls: inBucket.length, correct, rate };
    });

    // Day count
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysElapsedRaw = Math.floor(
      (now.getTime() - TRACK_RECORD_START.getTime()) / msPerDay,
    );
    const daysElapsed = Math.max(
      0,
      Math.min(daysElapsedRaw + 1, TRACK_RECORD_TOTAL_DAYS),
    );
    const daysRemaining = Math.max(0, TRACK_RECORD_TOTAL_DAYS - daysElapsed);

    // Sort + filter recommendations: resolved first (newest resolution), then open (newest createdAt)
    const sorted = [...all].sort((a, b) => {
      const aResolved = a.outcome != null;
      const bResolved = b.outcome != null;
      if (aResolved && !bResolved) return -1;
      if (!aResolved && bResolved) return 1;
      if (aResolved && bResolved) {
        const aTime = a.resolutionDate ? new Date(a.resolutionDate).getTime() : 0;
        const bTime = b.resolutionDate ? new Date(b.resolutionDate).getTime() : 0;
        return bTime - aTime;
      }
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    const filtered = sorted.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter === "resolved" && r.outcome == null) return false;
      if (statusFilter === "open" && r.outcome != null) return false;
      return true;
    });

    const recommendations = filtered.slice(0, limit);

    res.json({
      stats: {
        trackRecordStart: isoDate(TRACK_RECORD_START),
        trackRecordEnd: isoDate(TRACK_RECORD_END),
        daysElapsed,
        daysRemaining,
        totalCalls,
        resolvedCalls,
        openCalls,
        correctCalls,
        incorrectCalls,
        partialCalls,
        winRate,
        winRateWithPartial,
        avgEdge,
        avgAiProbability,
        totalPaperReturn,
        paperReturnPct,
        highConfidenceWinRate,
        highEdgeWinRate,
      },
      calibration,
      recommendations,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error building leaderboard");
    res.status(500).json({ error: e.message });
  }
});

export default router;
