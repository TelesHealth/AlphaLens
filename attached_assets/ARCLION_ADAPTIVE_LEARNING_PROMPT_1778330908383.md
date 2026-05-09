# Arclion — Stepped Learning System
## Adaptive AI Feedback Loop · May 2026

Paste this entire document into Replit AI.

---

## Overview

Build a four-stage adaptive learning system that
automatically activates as more recommendation
outcomes are resolved. The system runs entirely
in the background — no UI changes, no changes
to Charlize's workflow, no new API endpoints
required for users.

The system checks the resolved call count on
every recommendations scan and injects the
appropriate context block into Claude's prompt.
As thresholds are crossed, the AI automatically
gains access to richer feedback about its own
performance.

Stage 1: 0-49 resolved calls → no feedback (current)
Stage 2: 50-199 resolved calls → track record summary
Stage 3: 200-999 resolved calls → behavioral signals
Stage 4: 1000+ resolved calls → calibration model

All stages are additive — Stage 3 includes
Stage 2 context, Stage 4 includes Stages 2+3.

---

## STEP 1 — Create the learning service

Create artifacts/api-server/src/services/
adaptive-learning.ts

This service builds the feedback context block
that gets injected into Claude's prompt.

### Constants

```
const STAGE_2_THRESHOLD = 50;
const STAGE_3_THRESHOLD = 200;
const STAGE_4_THRESHOLD = 1000;
```

### Main function: buildLearningContext()

```
export async function buildLearningContext():
  Promise<{
    stage: 1 | 2 | 3 | 4,
    context: string | null,
    resolvedCount: number
  }>
```

This function:
1. Counts resolved TRADE CALL recommendations
2. Determines the current stage
3. Builds the appropriate context string
4. Returns the context to inject into Claude's prompt

If stage is 1: return { stage: 1, context: null }
If context fails to build: return null, never throw

Cache the result for 30 minutes — the learning
context doesn't need to recalculate on every scan.
Invalidate the cache when a new outcome is resolved
(listen for DB updates or just use TTL).

---

### STAGE 2 — Track Record Summary (50+ resolved)

Query the recommendations table for all resolved
TRADE CALLS (type = "trade", outcome IS NOT NULL).

Calculate these metrics:

```
// Overall
const totalResolved = resolved.length
const totalCorrect = resolved.filter(
  r => r.outcome === "correct"
).length
const totalPartial = resolved.filter(
  r => r.outcome === "partial"
).length
const overallWinRate = Math.round(
  (totalCorrect + totalPartial * 0.5)
  / totalResolved * 100
)

// By asset class
const byAssetClass = groupBy(resolved, "assetClass")
// For each group: calculate win rate

// By direction
const longCalls = resolved.filter(
  r => r.direction === "LONG" || r.direction === "YES"
)
const shortCalls = resolved.filter(
  r => r.direction === "SHORT" || r.direction === "NO"
)

// Recent trend (last 10 resolved)
const recent = resolved
  .sort((a, b) => b.resolutionDate - a.resolutionDate)
  .slice(0, 10)
const recentCorrect = recent.filter(
  r => r.outcome === "correct"
).length

// Systematic misses: asset classes with win rate < 40%
const systematicMisses = Object.entries(byAssetClass)
  .filter(([_, calls]) => winRate(calls) < 40)
  .map(([assetClass]) => assetClass)

// Conviction accuracy
const highConviction = resolved.filter(
  r => (r.convictionScore ?? 0) >= 20
)
const lowConviction = resolved.filter(
  r => (r.convictionScore ?? 0) < 10
)
```

Build Stage 2 context string:

```
`ARCLION TRACK RECORD CONTEXT (${totalResolved} resolved calls):

Overall win rate: ${overallWinRate}%
  Correct: ${totalCorrect} | Partial: ${totalPartial}
  | Incorrect: ${totalResolved - totalCorrect - totalPartial}

By asset class:
${Object.entries(byAssetClass).map(([cls, calls]) =>
  `  ${cls}: ${winRate(calls)}% (${calls.length} calls)`
).join('\n')}

By direction:
  LONG/YES calls: ${winRate(longCalls)}%
    (${longCalls.length} calls)
  SHORT/NO calls: ${winRate(shortCalls)}%
    (${shortCalls.length} calls)

Recent trend (last 10 resolved):
  ${recentCorrect}/10 correct
  ${recentCorrect >= 7 ? 'Model performing above average'
  : recentCorrect <= 3 ? 'Model in a rough patch — increase scrutiny'
  : 'Model performing at average rate'}

${systematicMisses.length > 0 ?
  `SYSTEMATIC MISSES — apply extra scrutiny:
  ${systematicMisses.join(', ')} win rate below 40%`
  : 'No systematic misses detected'}

Conviction accuracy:
  High conviction (score ≥20): ${winRate(highConviction)}%
    (${highConviction.length} calls)
  Low conviction (score <10): ${winRate(lowConviction)}%
    (${lowConviction.length} calls)

INSTRUCTION: Use this track record to calibrate your
current recommendations. Reduce confidence on asset
classes with win rates below 40%. Increase confidence
on asset classes where the model has been consistently
accurate (>70%). Flag in bearCase if you are recommending
a direction that has a poor historical win rate.`
```

---

### STAGE 3 — Behavioral Calibration (200+ resolved)

Adds user behavior patterns to Stage 2 context.

Query the live_trades and pending_orders tables
for anonymized aggregate behavioral data:

```
// Which recommendation types users act on
const executedRecs = await db
  .select({
    assetClass: recommendations.assetClass,
    direction: recommendations.direction,
    urgency: recommendations.urgency,
    convictionScore: recommendations.convictionScore
  })
  .from(liveTrades)
  .innerJoin(recommendations,
    eq(liveTrades.recommendationId, recommendations.id))
  .where(eq(liveTrades.status, "filled"))

// Group by asset class and direction
const mostActedOn = getMostFrequent(executedRecs, 3)
const leastActedOn = getLeastFrequent(executedRecs, 3)

// Average conviction of executed trades
const avgConviction = mean(
  executedRecs.map(r => r.convictionScore ?? 0)
)

// Urgency pattern — do users only act on HIGH?
const urgencyBreakdown = groupBy(executedRecs, "urgency")
```

Append to Stage 2 context:

```
`
USER BEHAVIOR SIGNALS (anonymized aggregate,
  ${executedRecs.length} paper trades analyzed):

Most acted-on setups:
${mostActedOn.map(m =>
  `  ${m.assetClass} ${m.direction}: ${m.count} trades`
).join('\n')}

Least acted-on setups:
${leastActedOn.map(m =>
  `  ${m.assetClass} ${m.direction}: ${m.count} trades`
).join('\n')}

Average conviction score of executed trades: ${avgConviction.toFixed(1)}
  (Users are primarily acting on recommendations
   with conviction above ${avgConviction.toFixed(0)})

Urgency pattern:
${Object.entries(urgencyBreakdown).map(([u, calls]) =>
  `  ${u}: ${calls.length} trades (${pct(calls, executedRecs)}%)`
).join('\n')}

INSTRUCTION: Weight your confidence and urgency labels
toward the patterns users find credible. If users
consistently ignore SHORT calls on a specific asset
class, consider whether your SHORT thesis for that
class is convincing enough to act on.`
```

---

### STAGE 4 — Calibration Model (1000+ resolved)

Adds statistical calibration adjustments to
Stages 2+3 context.

Calculate calibration curves per asset class:
For each asset class, group resolved calls by
AI probability bucket (50-59%, 60-69%, 70-79%, 80%+)
and calculate actual win rate per bucket.

```
// Build calibration map
const calibrationMap = {}

for (const assetClass of assetClasses) {
  const calls = resolvedByClass[assetClass]

  calibrationMap[assetClass] = {
    "50-59": winRateInRange(calls, 50, 59),
    "60-69": winRateInRange(calls, 60, 69),
    "70-79": winRateInRange(calls, 70, 79),
    "80+":   winRateInRange(calls, 80, 100),
  }
}

// Calculate calibration adjustment per asset class
// If AI says 70% but actual win rate is 55%,
// adjustment = 55 - 70 = -15 pts
const calibrationAdjustments = {}

for (const [assetClass, buckets] of
  Object.entries(calibrationMap)) {
  // Use the most populated bucket as reference
  const primaryBucket = getMostPopulatedBucket(buckets)
  const expectedRate = midpoint(primaryBucket)
  const actualRate = buckets[primaryBucket]
  calibrationAdjustments[assetClass] =
    Math.round(actualRate - expectedRate)
}

// Filter to only show significant adjustments (>5 pts)
const significantAdjustments = Object.entries(
  calibrationAdjustments
).filter(([_, adj]) => Math.abs(adj) > 5)
```

Append to Stages 2+3 context:

```
`
CALIBRATION ADJUSTMENTS (statistical model,
  ${totalResolved} resolved calls):

${significantAdjustments.length > 0
  ? significantAdjustments.map(([cls, adj]) =>
    `  ${cls}: ${adj > 0 ? '+' : ''}${adj} pts
      (AI has been ${adj > 0 ? 'underconfident' : 'overconfident'}
       on ${cls} — adjust confidence accordingly)`
  ).join('\n')
  : '  All asset classes well-calibrated — no adjustment needed'
}

Calibration curves (AI probability vs actual win rate):
${Object.entries(calibrationMap).map(([cls, buckets]) =>
  `  ${cls}:
    Said 60-69%: actually won ${buckets["60-69"] ?? "N/A"}%
    Said 70-79%: actually won ${buckets["70-79"] ?? "N/A"}%
    Said 80%+:   actually won ${buckets["80+"] ?? "N/A"}%`
).join('\n')}

INSTRUCTION: Apply the calibration adjustments above
to your confidence scores before finalizing each
recommendation. If the model shows you are
systematically overconfident in a specific asset
class, reduce your confidence score by the indicated
amount. This is not optional — the track record
data requires these adjustments for accuracy.`
```

---

## STEP 2 — Wire into recommendations

In artifacts/api-server/src/services/
recommendations.ts, in the scan function:

Before building Claude's prompt:

```
const { stage, context, resolvedCount } =
  await buildLearningContext();

console.log(`Adaptive learning: Stage ${stage}
  (${resolvedCount} resolved calls)`);
```

After building all other context blocks
(macro, TA, Danelfin, Unusual Whales):

```
// Add learning context last — it frames everything
if (context) {
  fullPrompt += `\n\n${context}`;
}
```

Add stage to the briefing response metadata:

```
// In the briefing API response, add:
learningStage: stage,
resolvedCallCount: resolvedCount
```

This allows the leaderboard to show
"AI is in Stage 2 learning mode" if desired
(optional display — no UI required).

---

## STEP 3 — Stage transition logging

In buildLearningContext(), when the stage
changes from the previous cached value,
log the transition:

```
console.log(`🎯 ADAPTIVE LEARNING: Stage transition!
  Previous: Stage ${previousStage}
  Current: Stage ${newStage}
  Resolved calls: ${resolvedCount}
  The AI now has access to ${stageName(newStage)}`);
```

This gives you clear visibility in Railway logs
when each stage activates — no manual checking needed.

---

## STEP 4 — Helper functions

Add these helpers to adaptive-learning.ts:

```
function winRate(calls: Recommendation[]): number {
  if (calls.length === 0) return 0;
  const correct = calls.filter(
    r => r.outcome === "correct"
  ).length;
  const partial = calls.filter(
    r => r.outcome === "partial"
  ).length;
  return Math.round(
    (correct + partial * 0.5) / calls.length * 100
  );
}

function groupBy<T>(arr: T[], key: keyof T):
  Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key] ?? "unknown");
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function getMostFrequent<T>(arr: T[], n: number) {
  const groups = groupBy(arr, "assetClass");
  return Object.entries(groups)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, n)
    .map(([key, items]) =>
      ({ assetClass: key, count: items.length }));
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(subset: any[], total: any[]): number {
  return Math.round(subset.length / total.length * 100);
}

function stageName(stage: number): string {
  const names = {
    1: "baseline mode (no feedback yet)",
    2: "track record awareness",
    3: "track record + behavioral calibration",
    4: "full statistical calibration model"
  };
  return names[stage] ?? "unknown";
}
```

---

## STEP 5 — Cache management

The learning context should be cached to avoid
recalculating on every scan.

In adaptive-learning.ts:

```
let learningContextCache: {
  stage: number,
  context: string | null,
  resolvedCount: number,
  cachedAt: number
} | null = null;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function isCacheValid(): boolean {
  if (!learningContextCache) return false;
  return Date.now() - learningContextCache.cachedAt
    < CACHE_TTL_MS;
}
```

On each call to buildLearningContext():
- Return cached result if valid
- Recalculate if cache is expired or null
- Always recalculate if resolved count has
  crossed a stage threshold since last cache

---

## VERIFICATION

1. pnpm run typecheck — zero errors

2. Test Stage 1 (current state):
   Call buildLearningContext() directly
   resolvedCount should be 11 (current resolved calls)
   stage should be 1
   context should be null

3. Simulate Stage 2 threshold crossing:
   Temporarily set STAGE_2_THRESHOLD = 10
   Call buildLearningContext()
   context should be a non-null string containing
   "ARCLION TRACK RECORD CONTEXT"
   Reset threshold to 50

4. Verify context is injected in scan:
   POST /api/recommendations/scan
   Check server console for:
   "Adaptive learning: Stage X (N resolved calls)"

5. Check Railway logs format:
   When threshold crossed, should log:
   "🎯 ADAPTIVE LEARNING: Stage transition!"

6. Verify no UI impact:
   GET /api/recommendations/briefing
   Response looks identical to before
   learningStage and resolvedCallCount are in
   the response metadata (not shown in UI)

7. Verify 30-minute cache:
   Call buildLearningContext() twice in rapid
   succession — second call should return
   cached result without DB query
   (check logs — DB query only runs once)

8. pnpm run typecheck — zero errors

Report all files changed.
Note which stage is currently active and
what the current resolved call count is.
