import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recommendationsTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import { categorizeUnresolved, derivePlatform } from "../services/outcome-resolver.js";

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
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 2000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const typeFilter = (req.query.type as string | undefined) ?? "all";
    const statusFilter = (req.query.status as string | undefined) ?? "all";
    

    const all = await db
      .select()
      .from(recommendationsTable)
      .orderBy(desc(recommendationsTable.createdAt));

    const trades = all.filter((r) => r.type === "trade");
    const watches = all.filter((r) => r.type === "watch");
    const avoids = all.filter((r) => r.type === "avoid");

    const resolvedTrades = trades.filter((r) => r.outcome != null);
    const openTrades = trades.filter((r) => r.outcome == null);

    const correctCalls = resolvedTrades.filter((r) => r.outcome === "correct").length;
    const incorrectCalls = resolvedTrades.filter((r) => r.outcome === "incorrect").length;
    const partialCalls = resolvedTrades.filter((r) => r.outcome === "partial").length;

    const totalCalls = trades.length;
    const resolvedCalls = resolvedTrades.length;
    const openCalls = openTrades.length;

    const autoResolved = resolvedTrades.filter((r) => r.resolutionMethod === "auto").length;
    const manualResolved = resolvedTrades.filter((r) => r.resolutionMethod === "manual").length;
    const pendingResolution = openTrades.filter((r) => {
      return categorizeUnresolved(r, derivePlatform(r)) === "needs-review";
    }).length;

    const winRate =
      resolvedCalls > 0 ? round1((correctCalls / resolvedCalls) * 100) : 0;
    const winRateWithPartial =
      resolvedCalls > 0
        ? round1(((correctCalls + partialCalls * 0.5) / resolvedCalls) * 100)
        : 0;

    const edgeValues = trades
      .map((r) => r.edge)
      .filter((v): v is number => typeof v === "number");
    const probValues = trades
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

    // Paper return is only calculated for resolved calls with a verified
    // entry price (assetPriceAtCall). Legacy calls predating that field, plus
    // prediction-market calls (which use probability not price), are excluded
    // from dollar P&L but still count toward win/loss rate.
    const paperReturnEligibleTrades = resolvedTrades.filter(
      (r) =>
        typeof r.assetPriceAtCall === "number" &&
        r.assetClass !== "prediction",
    );
    const paperReturnEligibleCalls = paperReturnEligibleTrades.length;
    const paperReturnExcludedCalls = resolvedCalls - paperReturnEligibleCalls;

    const paperReturns = paperReturnEligibleTrades
      .map((r) => r.paperReturn)
      .filter((v): v is number => typeof v === "number");
    const totalPaperReturn = round1(paperReturns.reduce((a, b) => a + b, 0));
    const capitalDeployed = paperReturnEligibleCalls * 100;
    const paperReturnPct =
      capitalDeployed > 0
        ? round1((totalPaperReturn / capitalDeployed) * 100)
        : 0;

    const paperReturnReliability: "verified" | "estimated" | "unavailable" =
      paperReturnEligibleCalls === 0
        ? "unavailable"
        : paperReturnEligibleTrades.every(
              (r) => typeof r.paperReturn === "number",
            )
          ? "verified"
          : "estimated";

    const highConfResolved = resolvedTrades.filter(
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

    const highEdgeResolved = resolvedTrades.filter(
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

    const convictionValues = resolvedTrades
      .map((r) => r.convictionScore)
      .filter((v): v is number => typeof v === "number");
    const avgConvictionScore =
      convictionValues.length > 0
        ? round1(
            convictionValues.reduce((a, b) => a + b, 0) /
              convictionValues.length,
          )
        : 0;

    const highConvictionResolved = resolvedTrades.filter(
      (r) => typeof r.convictionScore === "number" && r.convictionScore > 15,
    );
    const highConvictionWinRate =
      highConvictionResolved.length > 0
        ? round1(
            (highConvictionResolved.filter((r) => r.outcome === "correct")
              .length /
              highConvictionResolved.length) *
              100,
          )
        : null;

    const lowConvictionResolved = resolvedTrades.filter(
      (r) => typeof r.convictionScore === "number" && r.convictionScore < 10,
    );
    const lowConvictionWinRate =
      lowConvictionResolved.length > 0
        ? round1(
            (lowConvictionResolved.filter((r) => r.outcome === "correct")
              .length /
              lowConvictionResolved.length) *
              100,
          )
        : null;

    const buckets: Array<{ key: string; min: number; max: number }> = [
      { key: "60-69%", min: 60, max: 70 },
      { key: "70-79%", min: 70, max: 80 },
      { key: "80%+", min: 80, max: 101 },
    ];
    const calibration = buckets.map((b) => {
      const inBucket = resolvedTrades.filter(
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

    const resolvedWatches = watches.filter((r) => r.outcome != null);
    const resolvedAvoids = avoids.filter((r) => r.outcome != null);
    const correctAvoids = resolvedAvoids.filter((r) => r.outcome === "correct").length;

    const byType = {
      trade: {
        total: trades.length,
        resolved: resolvedTrades.length,
        correct: correctCalls,
        winRate,
      },
      watch: {
        total: watches.length,
        resolved: resolvedWatches.length,
      },
      avoid: {
        total: avoids.length,
        resolved: resolvedAvoids.length,
        correct: correctAvoids,
        winRate:
          resolvedAvoids.length > 0
            ? round1((correctAvoids / resolvedAvoids.length) * 100)
            : 0,
      },
    };

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

    // Sort by createdAt desc — newest call always on top, regardless of
    // resolution status. This matches the "Date" column the user sees and
    // makes pagination intuitive (page 1 = latest 50 calls overall).
    const sorted = [...all].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    const filtered = sorted.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter === "resolved" && r.outcome == null) return false;
      if (statusFilter === "open" && r.outcome != null) return false;
      // Outcome-specific filters operate on resolved rows only so the
      // pagination total matches what the user sees on the page.
      if (statusFilter === "correct" && r.outcome !== "correct") return false;
      if (statusFilter === "incorrect" && r.outcome !== "incorrect") return false;
      return true;
    });

    const totalMatchingFilter = filtered.length;
    const recommendations = filtered.slice(offset, offset + limit);

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
        paperReturnEligibleCalls,
        paperReturnExcludedCalls,
        highConfidenceWinRate,
        highEdgeWinRate,
        avgConvictionScore,
        highConvictionWinRate,
        lowConvictionWinRate,
        paperReturnReliability,
        autoResolved,
        manualResolved,
        pendingResolution,
        byType,
      },
      calibration,
      recommendations,
      pagination: {
        total: totalMatchingFilter,
        offset,
        limit,
      },
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error building leaderboard");
    res.status(500).json({ error: e.message });
  }
});

export default router;
