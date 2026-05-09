import { db } from "@workspace/db";
import {
  recommendationsTable,
  liveTradesTable,
} from "@workspace/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const STAGE_2_THRESHOLD = 50;
const STAGE_3_THRESHOLD = 200;
const STAGE_4_THRESHOLD = 1000;
const CACHE_TTL_MS = 30 * 60 * 1000;

export type LearningStage = 1 | 2 | 3 | 4;

interface LearningResult {
  stage: LearningStage;
  context: string | null;
  resolvedCount: number;
}

let learningContextCache:
  | (LearningResult & { cachedAt: number })
  | null = null;

function determineStage(resolvedCount: number): LearningStage {
  if (resolvedCount >= STAGE_4_THRESHOLD) return 4;
  if (resolvedCount >= STAGE_3_THRESHOLD) return 3;
  if (resolvedCount >= STAGE_2_THRESHOLD) return 2;
  return 1;
}

function isCacheValid(currentResolvedCount: number): boolean {
  if (!learningContextCache) return false;
  if (Date.now() - learningContextCache.cachedAt >= CACHE_TTL_MS) return false;
  // Force recalc if a stage threshold has been crossed since the cache was built.
  return (
    determineStage(currentResolvedCount) === learningContextCache.stage
  );
}

function stageName(stage: number): string {
  const names: Record<number, string> = {
    1: "baseline mode (no feedback yet)",
    2: "track record awareness",
    3: "track record + behavioral calibration",
    4: "full statistical calibration model",
  };
  return names[stage] ?? "unknown";
}

type ResolvedRec = typeof recommendationsTable.$inferSelect;

function winRate(calls: ResolvedRec[]): number {
  if (calls.length === 0) return 0;
  const correct = calls.filter((r) => r.outcome === "correct").length;
  const partial = calls.filter((r) => r.outcome === "partial").length;
  return Math.round(((correct + partial * 0.5) / calls.length) * 100);
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const k = String(item[key] ?? "unknown");
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(subset: unknown[], total: unknown[]): number {
  if (total.length === 0) return 0;
  return Math.round((subset.length / total.length) * 100);
}

function buildStage2Context(resolved: ResolvedRec[]): string {
  const total = resolved.length;
  const totalCorrect = resolved.filter((r) => r.outcome === "correct").length;
  const totalPartial = resolved.filter((r) => r.outcome === "partial").length;
  const totalIncorrect = total - totalCorrect - totalPartial;
  const overallWinRate = Math.round(
    ((totalCorrect + totalPartial * 0.5) / total) * 100,
  );

  const byAssetClass = groupBy(resolved, "assetClass");

  const longCalls = resolved.filter(
    (r) => r.direction === "LONG" || r.direction === "YES",
  );
  const shortCalls = resolved.filter(
    (r) => r.direction === "SHORT" || r.direction === "NO",
  );

  const recent = [...resolved]
    .sort((a, b) => {
      const ta = a.resolutionDate ? new Date(a.resolutionDate).getTime() : 0;
      const tb = b.resolutionDate ? new Date(b.resolutionDate).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 10);
  const recentCorrect = recent.filter((r) => r.outcome === "correct").length;
  const recentTrendNote =
    recentCorrect >= 7
      ? "Model performing above average"
      : recentCorrect <= 3
        ? "Model in a rough patch — increase scrutiny"
        : "Model performing at average rate";

  const systematicMisses = Object.entries(byAssetClass)
    .filter(([, calls]) => winRate(calls) < 40 && calls.length >= 3)
    .map(([cls]) => cls);

  const highConviction = resolved.filter(
    (r) => (r.convictionScore ?? 0) >= 20,
  );
  const lowConviction = resolved.filter(
    (r) => (r.convictionScore ?? 0) < 10,
  );

  const byClassLines = Object.entries(byAssetClass)
    .map(
      ([cls, calls]) =>
        `  ${cls || "unknown"}: ${winRate(calls)}% (${calls.length} calls)`,
    )
    .join("\n");

  return `ARCLION TRACK RECORD CONTEXT (${total} resolved calls):

Overall win rate: ${overallWinRate}%
  Correct: ${totalCorrect} | Partial: ${totalPartial} | Incorrect: ${totalIncorrect}

By asset class:
${byClassLines}

By direction:
  LONG/YES calls: ${winRate(longCalls)}% (${longCalls.length} calls)
  SHORT/NO calls: ${winRate(shortCalls)}% (${shortCalls.length} calls)

Recent trend (last 10 resolved):
  ${recentCorrect}/10 correct
  ${recentTrendNote}

${
  systematicMisses.length > 0
    ? `SYSTEMATIC MISSES — apply extra scrutiny:
  ${systematicMisses.join(", ")} win rate below 40%`
    : "No systematic misses detected"
}

Conviction accuracy:
  High conviction (score ≥20): ${winRate(highConviction)}% (${highConviction.length} calls)
  Low conviction (score <10): ${winRate(lowConviction)}% (${lowConviction.length} calls)

INSTRUCTION: Use this track record to calibrate your current recommendations. Reduce confidence on asset classes with win rates below 40%. Increase confidence on asset classes where the model has been consistently accurate (>70%). Flag in bearCase if you are recommending a direction that has a poor historical win rate.`;
}

interface ExecutedRec {
  assetClass: string | null;
  direction: string | null;
  urgency: string | null;
  convictionScore: number | null;
}

async function buildStage3Context(): Promise<string> {
  const executedRecs: ExecutedRec[] = await db
    .select({
      assetClass: recommendationsTable.assetClass,
      direction: recommendationsTable.direction,
      urgency: recommendationsTable.urgency,
      convictionScore: recommendationsTable.convictionScore,
    })
    .from(liveTradesTable)
    .innerJoin(
      recommendationsTable,
      eq(liveTradesTable.recommendationId, recommendationsTable.id),
    )
    .where(eq(liveTradesTable.status, "filled"));

  if (executedRecs.length === 0) {
    return `\nUSER BEHAVIOR SIGNALS: no executed paper trades available yet.`;
  }

  const setupGroups = new Map<string, { count: number; sample: ExecutedRec }>();
  for (const r of executedRecs) {
    const key = `${r.assetClass ?? "unknown"}::${r.direction ?? "unknown"}`;
    const existing = setupGroups.get(key);
    if (existing) existing.count++;
    else setupGroups.set(key, { count: 1, sample: r });
  }
  const sorted = [...setupGroups.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );
  const mostActedOn = sorted.slice(0, 3);
  const leastActedOn = sorted.slice(-3).reverse();

  const avgConviction = mean(
    executedRecs
      .map((r) => r.convictionScore ?? 0)
      .filter((n) => Number.isFinite(n)),
  );

  const urgencyBreakdown = groupBy(executedRecs, "urgency");

  const fmt = (
    list: [string, { count: number; sample: ExecutedRec }][],
  ): string =>
    list
      .map(([, v]) => {
        const { sample, count } = v;
        return `  ${sample.assetClass ?? "unknown"} ${sample.direction ?? "unknown"}: ${count} trades`;
      })
      .join("\n");

  return `\nUSER BEHAVIOR SIGNALS (anonymized aggregate, ${executedRecs.length} paper trades analyzed):

Most acted-on setups:
${fmt(mostActedOn)}

Least acted-on setups:
${fmt(leastActedOn)}

Average conviction score of executed trades: ${avgConviction.toFixed(1)}
  (Users are primarily acting on recommendations with conviction above ${avgConviction.toFixed(0)})

Urgency pattern:
${Object.entries(urgencyBreakdown)
  .map(
    ([u, calls]) =>
      `  ${u}: ${calls.length} trades (${pct(calls, executedRecs)}%)`,
  )
  .join("\n")}

INSTRUCTION: Weight your confidence and urgency labels toward the patterns users find credible. If users consistently ignore SHORT calls on a specific asset class, consider whether your SHORT thesis for that class is convincing enough to act on.`;
}

function bucketLabel(prob: number): "50-59" | "60-69" | "70-79" | "80+" | null {
  if (prob >= 80 && prob <= 100) return "80+";
  if (prob >= 70 && prob < 80) return "70-79";
  if (prob >= 60 && prob < 70) return "60-69";
  if (prob >= 50 && prob < 60) return "50-59";
  return null;
}

function midpoint(bucket: "50-59" | "60-69" | "70-79" | "80+"): number {
  return bucket === "50-59"
    ? 55
    : bucket === "60-69"
      ? 65
      : bucket === "70-79"
        ? 75
        : 90;
}

function buildStage4Context(resolved: ResolvedRec[]): string {
  const totalResolved = resolved.length;
  const byClass = groupBy(resolved, "assetClass");

  type Bucket = "50-59" | "60-69" | "70-79" | "80+";
  const calibrationMap: Record<string, Record<Bucket, number | null>> = {};
  const bucketCounts: Record<string, Record<Bucket, number>> = {};

  for (const [cls, calls] of Object.entries(byClass)) {
    const bucketed: Record<Bucket, ResolvedRec[]> = {
      "50-59": [],
      "60-69": [],
      "70-79": [],
      "80+": [],
    };
    for (const r of calls) {
      const p = r.aiProbability;
      if (typeof p !== "number") continue;
      const lbl = bucketLabel(p);
      if (lbl) bucketed[lbl].push(r);
    }
    calibrationMap[cls] = {
      "50-59": bucketed["50-59"].length > 0 ? winRate(bucketed["50-59"]) : null,
      "60-69": bucketed["60-69"].length > 0 ? winRate(bucketed["60-69"]) : null,
      "70-79": bucketed["70-79"].length > 0 ? winRate(bucketed["70-79"]) : null,
      "80+": bucketed["80+"].length > 0 ? winRate(bucketed["80+"]) : null,
    };
    bucketCounts[cls] = {
      "50-59": bucketed["50-59"].length,
      "60-69": bucketed["60-69"].length,
      "70-79": bucketed["70-79"].length,
      "80+": bucketed["80+"].length,
    };
  }

  const calibrationAdjustments: Record<string, number> = {};
  for (const [cls, buckets] of Object.entries(bucketCounts)) {
    let primary: Bucket | null = null;
    let primaryCount = 0;
    for (const b of ["50-59", "60-69", "70-79", "80+"] as Bucket[]) {
      if (buckets[b] > primaryCount) {
        primaryCount = buckets[b];
        primary = b;
      }
    }
    if (!primary || primaryCount === 0) continue;
    const actual = calibrationMap[cls][primary];
    if (actual == null) continue;
    calibrationAdjustments[cls] = Math.round(actual - midpoint(primary));
  }

  const significant = Object.entries(calibrationAdjustments).filter(
    ([, adj]) => Math.abs(adj) > 5,
  );

  const adjustmentLines =
    significant.length > 0
      ? significant
          .map(
            ([cls, adj]) =>
              `  ${cls}: ${adj > 0 ? "+" : ""}${adj} pts (AI has been ${adj > 0 ? "underconfident" : "overconfident"} on ${cls} — adjust confidence accordingly)`,
          )
          .join("\n")
      : "  All asset classes well-calibrated — no adjustment needed";

  const curveLines = Object.entries(calibrationMap)
    .map(
      ([cls, b]) =>
        `  ${cls}:
    Said 60-69%: actually won ${b["60-69"] ?? "N/A"}%
    Said 70-79%: actually won ${b["70-79"] ?? "N/A"}%
    Said 80%+:   actually won ${b["80+"] ?? "N/A"}%`,
    )
    .join("\n");

  return `\nCALIBRATION ADJUSTMENTS (statistical model, ${totalResolved} resolved calls):

${adjustmentLines}

Calibration curves (AI probability vs actual win rate):
${curveLines}

INSTRUCTION: Apply the calibration adjustments above to your confidence scores before finalizing each recommendation. If the model shows you are systematically overconfident in a specific asset class, reduce your confidence score by the indicated amount. This is not optional — the track record data requires these adjustments for accuracy.`;
}

export async function buildLearningContext(): Promise<LearningResult> {
  try {
    // Cheap count first — avoids fetching full rows when we just need the stage.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recommendationsTable)
      .where(
        and(
          eq(recommendationsTable.type, "trade"),
          isNotNull(recommendationsTable.outcome),
        ),
      );
    const resolvedCount = Number(count) || 0;
    const stage = determineStage(resolvedCount);

    if (isCacheValid(resolvedCount)) {
      return {
        stage: learningContextCache!.stage as LearningStage,
        context: learningContextCache!.context,
        resolvedCount: learningContextCache!.resolvedCount,
      };
    }

    const previousStage = learningContextCache?.stage;

    let context: string | null = null;
    if (stage >= 2) {
      // Only fetch full rows when we actually need to build context.
      const resolvedAll: ResolvedRec[] = await db
        .select()
        .from(recommendationsTable)
        .where(
          and(
            eq(recommendationsTable.type, "trade"),
            isNotNull(recommendationsTable.outcome),
          ),
        );
      const stage2 = buildStage2Context(resolvedAll);
      let combined = stage2;
      if (stage >= 3) combined += "\n\n" + (await buildStage3Context());
      if (stage >= 4) combined += "\n\n" + buildStage4Context(resolvedAll);
      context = combined;
    }

    const result: LearningResult = { stage, context, resolvedCount };
    learningContextCache = { ...result, cachedAt: Date.now() };

    if (previousStage != null && previousStage !== stage) {
      logger.info(
        {
          previousStage,
          newStage: stage,
          resolvedCount,
        },
        `🎯 ADAPTIVE LEARNING: Stage transition! Previous: Stage ${previousStage} → Current: Stage ${stage} (${resolvedCount} resolved calls). The AI now has access to ${stageName(stage)}`,
      );
    }

    return result;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "Adaptive learning: build failed");
    return { stage: 1, context: null, resolvedCount: 0 };
  }
}
