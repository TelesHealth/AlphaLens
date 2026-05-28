# Pipeline Map — 2026-05-28

**Investigator:** Replit Agent (read-only run, per James's instructions)
**Scope:** End-to-end map of the prediction → coach → resolution → scoring pipeline against current code, plus a data-source reconciliation between the three "resolved" counts disagreeing today.
**Hard rules honored:** no source files modified except this doc. No project tasks, no git writes, no deploys. Empty / absent results are reported as absent — nothing inferred or fabricated. Verbatim code quotes where the brief asked for verbatim.

---

## 1. Recommendation Generation

**File:** `artifacts/api-server/src/services/recommendations.ts`
**Model call (recommendations.ts:644):**

```ts
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 8000,
  system: AGENT_SYSTEM_PROMPT,
  messages: [{ role: "user", content: prompt }],
});
```

No `temperature` is passed (defaults to whatever the Anthropic SDK uses for Sonnet — not pinned in code).

**Agent system prompt — verbatim, complete (recommendations.ts:34–82):**

```
You are the Arclion proactive trading intelligence agent.

Scan a list of scored assets and identify the BEST opportunities:
1. TRADE CALL - clear edge, strong evidence, act now
2. WATCH - developing setup, wait for confirmation trigger
3. AVOID - risk elevated, evidence against a position

For EACH recommendation provide:
- A punchy headline (max 12 words) like a tip from a sharp trader
- Why flagged (3-5 specific signal bullets, not generic)
- Historical context: what happened in similar past setups (cite year + outcome)
- Entry trigger (for WATCH) or action (for TRADE)
- Confidence score 0-100
- Execution window
- Urgency: high (act today) | medium (this week) | low (developing)
- Bear case: what could make this wrong
- Edge explanation: ONE sentence (max 40 words) that directly explains the edge number. Start with the market price, then the AI probability, then the specific data that justifies the gap. Example format: "The market prices [event] at [X]% while macro data ([source]: [value]) and [source] data suggest [Y]% probability, creating a [Z]-point mispricing."
- Confidence rationale: ONE sentence (max 30 words) explaining why confidence is high or low for this call. Reference the specific data sources that agree or conflict. Example: "High confidence — BLS unemployment trend, BEA GDP deceleration, and Kalshi market pricing all support this direction independently."

RULES:
- Max 3 TRADE CALLS per briefing
- Max 8 WATCHES per briefing
- Always cite specific historical analog with year
- Never force a recommendation if no strong opportunity exists
- When smart money signals are provided, cross-reference them with asset data. A large options bet on an asset where AI also shows edge is a high-conviction signal.
- Danelfin is an independent AI system scoring US-listed stocks and ETFs 1-10 across Overall, Technical, Fundamental, Sentiment, and Low Risk. When a Danelfin score is provided: score >= 7 with bullish direction → increase confidence by up to 10 points. Score <= 3 with bullish direction → flag the conflict in bearCase and reduce confidence. Never ignore a conflicting Danelfin signal.

Return JSON array only. Each object:
{
  "type": "trade" or "watch" or "avoid",
  "urgency": "high" or "medium" or "low",
  "title": "Short punchy headline",
  "assetTitle": "Name of the asset",
  "sector": "sector name",
  "region": "Middle East or Asia-Pacific or Europe or Americas or Africa or Global",
  "direction": "LONG or SHORT or YES or NO or WATCH",
  "headline": "2-3 sentence explanation",
  "why": ["signal 1", "signal 2", "signal 3"],
  "historicalContext": "Specific analog with year and outcome",
  "bearCase": "What could make this wrong",
  "entryTrigger": "Specific price/event that confirms trade (for WATCH)",
  "confidence": 75,
  "window": "2-3 weeks",
  "urgencyReason": "Why this urgency level",
  "edgeExplanation": "One sentence explaining the edge number with market price, AI probability, and supporting data sources",
  "confidenceRationale": "One sentence explaining why confidence is high or low, citing specific data sources"
}

Return ONLY valid JSON array. No markdown. No preamble. No trailing commas. No single quotes. All property names must be double-quoted.
```

**The insert — verbatim (recommendations.ts:414–459):**

```ts
await db.insert(recommendationsTable).values({
  briefingId: briefing.id,
  type: rec.type,
  urgency: rec.urgency,
  title: rec.title,
  assetId: matchedAsset?.id ?? null,
  assetTitle: rec.assetTitle ?? "",
  assetClass,
  sector: rec.sector ?? "",
  region: rec.region ?? matchedAsset?.region ?? "Global",
  direction: rec.direction,
  headline: rec.headline,
  why: rec.why,
  historicalContext: rec.historicalContext,
  bearCase: rec.bearCase,
  entryTrigger: rec.entryTrigger,
  confidence: rec.confidence,
  window: rec.window,
  urgencyReason: rec.urgencyReason,
  edge,
  edgeType,
  convictionScore,
  edgeCalculatedAt: new Date(),
  edgeExplanation,
  confidenceRationale,
  aiProbability: aiProb,
  marketPrice: marketPriceField,
  assetPriceAtCall,
  taSignal: isPrediction
    ? null
    : (matchedAsset?.symbol &&
        taSignalCache.get(matchedAsset.symbol.toUpperCase())) ||
      null,
  danelfinScore:
    matchedAsset?.symbol && isDanelfinEligible(matchedAsset.sector)
      ? danelfinCache.get(matchedAsset.symbol.toUpperCase()) ?? null
      : null,
  sources: buildSources(
    matchedAsset,
    smartMoneySummary,
    macroIncluded,
    matchedAsset?.symbol
      ? !!danelfinCache.get(matchedAsset.symbol.toUpperCase())
      : false,
  ),
});
```

**Field-by-field provenance:**

| Field | Source | Notes |
|---|---|---|
| `type`, `urgency`, `title`, `assetTitle`, `sector`, `region`, `direction`, `headline`, `window`, `urgencyReason` | **Model output** | Straight passthrough of `RawRecommendation` JSON fields the agent returned. |
| `bearCase` | **Model output** | Straight from `rec.bearCase` — exactly what the agent emitted. |
| `why` jsonb | **Model output** | Straight from `rec.why` (3–5 string array). |
| `historicalContext` | **Model output** | Straight from `rec.historicalContext`. |
| `entryTrigger` | **Model output** | Straight from `rec.entryTrigger`. |
| `confidence` (integer 0–100) | **Model output** | The model's `rec.confidence` integer, persisted as-is. |
| `confidenceRationale` | **Model output, with hardcoded fallback** | `recommendations.ts:408–412`: if `rec.confidenceRationale` is empty, the string `"Confidence based on available macro and market data."` is written. |
| `edgeExplanation` | **Model output, with computed fallback** | `recommendations.ts:398–406`: if `rec.edgeExplanation` is empty, the system synthesizes one from the computed `aiProb / marketPriceField / edge` numbers (the boilerplate `"The AI assigns X% probability vs market's Y, a Z-point directional edge."` line seen on all 5 ETH losers in the prior audit). |
| `aiProbability` | **Computed** | `aiProb = matchedAsset?.aiProbability ?? 0` (the *asset's* AI probability — i.e. read off the `assets` table, not the rec's own model output). |
| `marketPrice` | **Computed** | Prediction asset → `matchedAsset.marketProbability ?? matchedAsset.currentPrice`. Non-prediction → `matchedAsset.currentPrice`. |
| `assetPriceAtCall` | **Computed** | Non-prediction: `matchedAsset.currentPrice`. Prediction: `null`. |
| `edge` | **Computed** | Prediction: `aiProb - marketPriceField`. Non-prediction: `isShort ? 50-aiProb : aiProb-50`. |
| `edgeType` | **Hardcoded by branch** | `"probability_gap"` for predictions, `"directional_conviction"` otherwise. |
| `convictionScore` | **Computed** | See §2. |
| `edgeCalculatedAt` | **Computed** | `new Date()` at insert time. |
| `taSignal` jsonb | **Computed** | `taSignalCache.get(symbol.toUpperCase())` — only populated for non-prediction assets with ≥50 days of price history. |
| `danelfinScore` jsonb | **Computed** | From per-scan `danelfinCache`. |
| `sources` jsonb | **Computed** | `buildSources(...)` (recommendations.ts:248–280) inspects matched asset class + which integrations were available. |
| `briefingId` | **Computed** | FK to the just-inserted `daily_briefings` row. |
| `outcome`, `resolutionDate`, `resolutionNote`, `marketPriceAtResolution`, `paperReturn`, `resolutionMethod` | **Not written here** | Filled in later by the outcome resolver (§5). |

**Where the model's confidence/conviction comes from at generation time:**

- The prompt asks the agent for `"Confidence score 0-100"` (bullet 5 of "For EACH recommendation provide", quoted in full above) and pins it in the JSON schema as `"confidence": 75`.
- The parsed value lives on `RawRecommendation.confidence` (recommendations.ts:120) and is persisted directly into `recommendations.confidence` (recommendations.ts:430) — **the model's confidence IS stored at call time**.
- "Conviction" is NOT asked of the model — there is no `conviction` field in the agent's JSON schema. `convictionScore` is purely computed downstream (see §2).

---

## 2. `conviction_score` — why it's dead

**Every write site:** `convictionScore` is written in exactly one place — the insert at recommendations.ts:435 (quoted in §1). There is no other code path that updates it. There are no migrations / backfills / schedulers that touch the column.

**Formula — verbatim (recommendations.ts:395–396):**

```ts
const confidenceWeight = (rec.confidence ?? 60) / 100;
const convictionScore = Math.round(edge * confidenceWeight * 10) / 10;
```

…where `edge` (recommendations.ts:382–393) is:

```ts
if (isPrediction) {
  marketPriceField =
    matchedAsset?.marketProbability ?? matchedAsset?.currentPrice ?? null;
  assetPriceAtCall = null;
  edge = aiProb - (marketPriceField ?? 0);
  edgeType = "probability_gap";
} else {
  marketPriceField = matchedAsset?.currentPrice ?? null;
  assetPriceAtCall = marketPriceField;
  edge = isShort ? 50 - aiProb : aiProb - 50;
  edgeType = "directional_conviction";
}
```

…and `aiProb = matchedAsset?.aiProbability ?? 0` (recommendations.ts:373).

**Why the observed range is compressed (−7.7 to 4.3 across 165 resolved):**

- For **non-prediction** assets (crypto / equities / commodities — the bulk of resolved recs in the prior audit), `edge = aiProb - 50` (LONG) or `50 - aiProb` (SHORT). This anchors edge at zero whenever the asset's `aiProbability` is at the baseline 50. The scoring model is told *"Be calibrated — don't always predict 50%"* (scoring.ts:38) but otherwise has no calibration target, so its outputs cluster near 50–65. Result: `edge` lives in roughly the ±15 band for non-predictions, and is exactly 0 whenever the matched asset has `aiProbability = 50` (or `aiProbability` is null, since `?? 0` yields edge = −50 for LONG, but those rows seem to be rare in resolved set — most resolved rows show edge = 0).
- The confidence weight `confidence / 100` lives in `[0.5, 0.85]` empirically (the prior audit showed avg confidence ≈ 71). That further compresses everything by ~30 %.
- Combined: `edge × confidenceWeight` for a typical non-prediction call is `(0 to 15) × (0.5 to 0.85)` = `0 to 12.75`. Subtract symmetry for LONG vs SHORT and you get the observed roughly `[-8, +5]` band.
- **There is no normalization** (no division by stddev, no scaling to a 0–100 range, no z-score). The "conviction score" is literally `edge × confidenceWeight × 10 / 10` — i.e. just `edge × confidenceWeight`. The `× 10 / 10` is a `Math.round(_, 1)` idiom, not a scaling factor.
- **There is no units bug** in the formula itself, BUT: a user looking at "conviction" in the UI is shown a number whose mathematical maximum (with `edge = 50, confidence = 100`) is 50 and whose mathematical minimum is −50, while the agent prompt and the UI both suggest "conviction" is on a 0–100 scale (the prompt's `confidence: 75` example, the UI's percent-style display). So the field is *defined* on roughly a ±50 scale, but the SCORING_PROMPT produces inputs that keep it in the ±15 band — the formula is sound, the *inputs* are uncalibrated.

**Diagnosis (from the code, no fix):** `convictionScore` is "dead" because (a) it is mechanically derived from `edge`, (b) `edge` is mechanically derived from an `aiProbability` that the scoring prompt does not push away from 50, and (c) the resulting product is then never normalized to a usable display range. The formula is correct; the upstream signal is flat.

---

## 3. `confidence` — every place it lives

**Place 1 — `coach.ts:395`, in context (services/coach.ts:393–431):**

```ts
const recommendations: string[] = [];
let riskAssessment: string | null = null;
const confidence = 0.75;
let mainAnalysis = analysis;

const recIdx = analysis.indexOf("RECOMMENDATIONS:");
if (recIdx !== -1) {
  mainAnalysis = analysis.slice(0, recIdx).trim();
  const afterRec = analysis.slice(recIdx + "RECOMMENDATIONS:".length);
  const riskIdx = afterRec.indexOf("RISK:");
  const recBlock = riskIdx !== -1 ? afterRec.slice(0, riskIdx) : afterRec;
  for (const line of recBlock.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.match(/^\d+\.\s/)) {
      recommendations.push(trimmed.replace(/^[-•\d.]\s*/, "").trim());
    }
  }

  if (riskIdx !== -1) {
    const afterRisk = afterRec.slice(riskIdx + "RISK:".length);
    const confIdx = afterRisk.indexOf("CONFIDENCE:");
    const riskLine = confIdx !== -1 ? afterRisk.slice(0, confIdx) : afterRisk;
    riskAssessment = riskLine.trim().split("\n")[0].trim() || null;
  }
} else {
  …
}

return {
  analysis: sanitizeMarkdown(mainAnalysis),
  recommendations: recommendations.slice(0, 5).map(sanitizeMarkdown),
  riskAssessment: riskAssessment ? sanitizeMarkdown(riskAssessment) : null,
  confidence,
};
```

— Confirmed: the API field `confidence` returned to the client (and persisted into `coach_messages.confidence` for authenticated callers) is the hardcoded `0.75`. **The `0.3` fallback in the catch block (coach.ts:441) is the only other value this field can ever take, and only when the Anthropic call throws.**

**What happens to the model's `CONFIDENCE: 0-100` line:**

Walking the parser above: the code locates `"CONFIDENCE:"` via `afterRisk.indexOf("CONFIDENCE:")`, but it uses that index **only as a delimiter** to bound the `RISK:` slice — it never reads the bytes AFTER `"CONFIDENCE:"` into a variable. There is no `parseFloat`, no `Number(…)`, no regex extraction, no DB write, no log line that touches the model's confidence value. **The model's `CONFIDENCE: <0-100>` number is parsed off the response as a side effect of bounding `RISK:`, then dropped on the floor.** It is not stored, not returned, not logged.

The model's `CONFIDENCE: …` text *does* survive in one place: it remains in the `analysis` string that flows into `coach_messages.content` (since `mainAnalysis = analysis.slice(0, recIdx).trim()` cuts at `RECOMMENDATIONS:`, the `RISK:` and `CONFIDENCE:` blocks are stripped from the user-facing `analysis` text — so in practice the model's confidence number is **not even visible in the persisted content**).

**Is the model's real confidence persisted on any table/field a calibration analysis could read?**

- **For coach replies:** **No.** Not on `coach_messages` (the `confidence` column there is the hardcoded `0.75`). Not anywhere else. **Coach-reply confidence has never been recorded.**
- **For recommendations:** **Yes.** The agent's `rec.confidence` (the integer 0–100 from the AGENT_SYSTEM_PROMPT) is written to `recommendations.confidence` at recommendations.ts:430. That column is populated on every rec the agent emits and is queryable post-resolution.

So for a calibration analysis of *recommendations*, the data exists. For a calibration analysis of *coach replies*, the data does not exist.

---

## 4. Coach Input Assembly

**File:** `artifacts/api-server/src/services/coach.ts`, function `getCoachAnalysis()` at line 326.

**Verbatim assembly (coach.ts:326–351):**

```ts
export async function getCoachAnalysis(input: CoachInput) {
  let assetContext = "";
  if (input.assetId != null) {
    assetContext = await buildAssetContext(input.assetId);
  }
  const [marketSnapshot, topOpportunities, briefingLine, macroContext] =
    await Promise.all([
      buildMarketSnapshot(input.question),
      buildTopOpportunities(),
      buildLatestBriefing(),
      fetchMacroContext(),
    ]);
  const macroBlock = macroContext.replace(/^\n+/, "").trim();
  const contextParts = [
    marketSnapshot,
    topOpportunities,
    briefingLine,
    assetContext,
    macroBlock,
    input.context,
  ]
    .filter(Boolean)
    .join("\n\n");
  const prompt = contextParts
    ? `--- LIVE DATA AVAILABLE ---\n${contextParts}\n--- END LIVE DATA ---\n\nUser question: ${input.question}`
    : `User question: ${input.question}`;
```

**The recommendation block the coach gets — verbatim (`buildTopOpportunities()`, coach.ts:265–302):**

```ts
async function buildTopOpportunities(): Promise<string> {
  try {
    const openRecs = await db
      .select()
      .from(recommendationsTable)
      .where(
        and(
          isNull(recommendationsTable.outcome),
          eq(recommendationsTable.type, "trade"),
        ),
      )
      .orderBy(sql`${recommendationsTable.convictionScore} DESC NULLS LAST`)
      .limit(3);

    if (openRecs.length === 0) return "";

    const lines: string[] = ["TOP OPPORTUNITIES (by conviction score):"];
    openRecs.forEach((r, i) => {
      const conv =
        typeof r.convictionScore === "number"
          ? r.convictionScore.toFixed(1)
          : "N/A";
      const edge =
        typeof r.edge === "number"
          ? `${r.edge >= 0 ? "+" : ""}${r.edge.toFixed(1)}`
          : "N/A";
      lines.push(
        `${i + 1}. ${r.assetTitle || r.title}: conviction ${conv}, edge ${edge}`,
      );
      if (r.edgeExplanation && r.edgeExplanation.trim().length > 0) {
        lines.push(`   ${r.edgeExplanation.trim()}`);
      }
    });
    return lines.join("\n");
  } catch {
    return "";
  }
}
```

**Confirmed: the coach receives, for the top 3 open `trade` recs only:**
- `assetTitle || title`
- `convictionScore` (1 decimal)
- `edge` (1 decimal, signed)
- `edgeExplanation` (a single sentence — and as §1 noted, this is often the computed boilerplate `"The AI assigns X% probability vs market's Y, a Z-point directional edge."` when the agent didn't emit one).

**Fields PRESENT on each rec row but OMITTED from the coach's prompt:**
`type`, `urgency`, `assetClass`, `sector`, `region`, `direction`, `headline`, **`why` jsonb**, **`historicalContext`**, **`bearCase`**, **`entryTrigger`**, `confidence` (the integer), `window`, **`urgencyReason`**, `confidenceRationale`, `aiProbability`, `marketPrice`, `assetPriceAtCall`, `edgeType`, `taSignal` jsonb, `danelfinScore` jsonb, `sources` jsonb, `outcome` (open by filter), `resolutionDate`, `resolutionNote`, `marketPriceAtResolution`, `paperReturn`, `resolutionMethod`.

**Direct answer to the carry-over question:** `bear_case`, `why` jsonb, `historical_context`, `entry_trigger`, `urgency_reason` are NOT passed to the coach. The prior audit's finding is confirmed against the current code — `buildTopOpportunities()` writes only `<title>: conviction N, edge ±N` plus the one-line `edgeExplanation`, then `getCoachAnalysis()` joins that block with `marketSnapshot / briefingLine / assetContext / macroBlock / input.context` and ships the whole thing to Claude with `COACH_PROMPT` as system. No other path injects rec-level reasoning into the coach's context.

---

## 5. Outcome Resolution

**File:** `artifacts/api-server/src/services/outcome-resolver.ts`.

**How a rec gets marked correct/incorrect/partial — the dispatch, verbatim (outcome-resolver.ts:631–693):**

```ts
for (const rec of openCalls) {
  const platform = derivePlatform(rec);
  let result: ResolutionResult = { resolved: false };
  try {
    if (platform === "kalshi") {
      result = await resolveKalshiOutcome(rec);
    } else if (platform === "polymarket") {
      result = await resolvePolymarketOutcome(rec);
    } else if (platform === "price") {
      result = await resolvePriceOutcome(rec);
    } else if (platform === "macro") {
      result = await resolveEconomicOutcome(rec);
    }
  } catch (err: any) { … }

  if (result.resolved && result.outcome) {
    try {
      await db
        .update(recommendationsTable)
        .set({
          outcome: result.outcome,
          resolutionDate: result.resolutionDate ?? new Date(),
          resolutionNote: result.note ?? null,
          marketPriceAtResolution: result.marketPriceAtResolution ?? null,
          paperReturn: result.paperReturn ?? null,
          resolutionMethod: "auto",
        })
        .where(eq(recommendationsTable.id, rec.id));
      …
```

— so resolution writes exactly six columns on the existing `recommendations` row: `outcome`, `resolutionDate`, `resolutionNote`, `marketPriceAtResolution`, `paperReturn`, `resolutionMethod`. **No new row is created; nothing on the rec's prediction-time state is modified.**

**Platform → table:** only `recommendations`. There is no separate `resolutions` or `outcomes` table — `outcome` is a column on the source row.

**Threshold logic for `correct / incorrect / partial`:**

- **Price-based (crypto / equities / commodities / FX) — `resolvePriceOutcome` at outcome-resolver.ts:392:**

  ```ts
  if (entryPrice != null) {
    const flat = currentPrice > entryPrice * 0.995 && currentPrice < entryPrice * 1.005;
    if (dir === "long" || dir === "yes") {
      outcome = flat ? "partial" : currentPrice > entryPrice ? "correct" : "incorrect";
    } else {
      outcome = flat ? "partial" : currentPrice < entryPrice ? "correct" : "incorrect";
    }
  }
  ```

  i.e. ±0.5 % band around entry = `partial`, otherwise direction match vs entry → `correct` / `incorrect`. Resolution only fires once `parseWindowDeadline(rec)` says the rec's `window` field has elapsed.

- **Kalshi — `resolveKalshiOutcome` at outcome-resolver.ts:157:**

  ```ts
  if (dir === "yes" && result === "yes") outcome = "correct";
  else if (dir === "yes" && result === "no") outcome = "incorrect";
  else if (dir === "no" && result === "no") outcome = "correct";
  else if (dir === "no" && result === "yes") outcome = "incorrect";
  ```

  Only fires once Kalshi's finalized-market endpoint returns a `"yes"`/`"no"` result for the earliest contract whose close-time is ≥ rec creation time. No `partial` outcome is ever emitted by the Kalshi path.

- **Polymarket — `resolvePolymarketOutcome` at outcome-resolver.ts:232:** same 4-way comparison vs `winning_side`. No `partial`.

- **Macro (CPI / unemployment / GDP / fed-funds) — `resolveEconomicOutcome` at outcome-resolver.ts:523:** `currentValue > entry` for `long/yes` → `correct`, else `incorrect`. No `partial`. No tolerance band.

**`paper_return` computation:**

- **Price (outcome-resolver.ts:487–491):** `(currentPrice − entryPrice) / entryPrice × directionMultiplier × $100`, rounded to cents. `directionMultiplier = −1` for SHORT/NO else `+1`. Entry price prefers `assetPriceAtCall`, falls back to `marketPrice` (with a guard that rejects `marketPrice` if it looks identical to `aiProbability`, since older rows duplicated that). If no entry price can be recovered, the rec stays open with a "needs review" note instead of being scored.
- **Kalshi (outcome-resolver.ts:191–204):** cents-on-the-dollar paper trade. `buyPrice` = `entryPrice` (for YES dir) or `100 − entryPrice` (for NO). Settled at `100` or `0`. `paperReturn = (settlePrice − buyPrice) / 100 × $100`. Only set when `entryPrice` (`rec.marketPrice`) is numeric and `buyPrice > 0`.
- **Polymarket:** `paperReturn: null`. **Not computed.**
- **Macro:** `paperReturn: null`. **Not computed.**

**Default paper-trade size (outcome-resolver.ts:14):** `const DEFAULT_PAPER_TRADE_USD = 100;`

**Per-rec or batch?** Per-rec. The resolver loops over every open `trade` row (`outcome IS NULL` AND `type = 'trade'`) and updates each in place. There is no aggregate row.

**Does it store enough for calibration?** Yes for prediction-time inputs:
- The original rec row still carries `confidence` (model-emitted integer 0–100), `convictionScore`, `edge`, `aiProbability`, `marketPrice`, `assetPriceAtCall`, `direction`, `assetClass`, `sector`, `bearCase`, `why`, `historicalContext` — none of those are wiped by resolution.
- Resolution adds `outcome`, `marketPriceAtResolution`, `paperReturn`, `resolutionDate`, `resolutionNote`, `resolutionMethod`.
- So a single `SELECT` against `recommendations WHERE outcome IS NOT NULL` recovers everything a calibration harness needs (model confidence at call + asset class + direction + outcome + paper return), **for the recommendation path only**. The coach path has no equivalent — coach replies are stored on `coach_messages`, are never associated with a rec id, and their `confidence` column is the hardcoded `0.75` (§3).

---

## 5.5 Data-Source Reconciliation — which "resolved" count is real

The three views disagree today:

| View | Reported "resolved" count |
|---|---:|
| Signal Tracker spreadsheet (Google Sheet export) | ~3 |
| Postgres `recommendations` table (this Repl's DB) | **165** |
| Supabase "Asset Trading Performance Summary" export | ~33 executed trades |

**Code/search findings:**

- **`rg -in "supabase|googleapis|sheets|gspread|apps[-_ ]?script|webhook|export.*to|sync.*to" --type ts --type js --type json --type yaml --type toml` over the entire repo (`artifacts/`, `lib/`, root) returns ZERO matches.** There is no Supabase client SDK import, no `@supabase/*` dependency, no Google Sheets API call, no Apps Script file, no CSV/webhook exporter, and no scheduled "sync to <external>" job anywhere in this codebase.
- The api-server is configured with **one** database connection: `DATABASE_URL` (Postgres, the same instance these queries are running against). No alternate connection strings (`SUPABASE_URL`, `SUPABASE_KEY`, etc.) are referenced in code or registered as required environment secrets.
- The outcome resolver writes resolution outcomes to **one place only**: `recommendations` columns on this Postgres DB (verbatim quote in §5). There is no fan-out to a second store.

**What this means for the three counts:**

| Source | What this codebase says about it |
|---|---|
| **Postgres `recommendations`** — 165 resolved | **Produced by this codebase.** `outcome-resolver.ts` writes here every time it runs, and a fresh count today (re-queried during this audit) confirms 165 rows with `outcome IN ('correct','incorrect','partial')`. Authoritative for "what this Replit app currently believes happened." |
| **Signal Tracker Google Sheet** — ~3 resolved | **Not produced by this codebase.** No Apps Script, no Sheets API client, no exporter. The Sheet must be either (a) manually maintained by James / Charlize, (b) populated by an Apps Script that *reads* from somewhere outside this Repl, or (c) an artifact from an earlier (pre-Replit) version of the system. **From inside this Repl I cannot determine which.** |
| **Supabase "Asset Trading Performance Summary"** — ~33 executed trades | **Not produced by this codebase.** No Supabase client is configured here, and the Postgres this Repl connects to is *not* a Supabase-hosted instance as far as the code is concerned (no Supabase-specific env vars are referenced). It is **either a separate database** managed by a different (likely earlier) version of the system, **or** it is a Supabase view over the same Postgres data published through a connection this codebase does not own. **I cannot determine which from inside the Repl.** Also worth noting: "~33 executed trades" describes a different population than "resolved recommendations" — `live_trades` (the executed-trade table in *this* DB) currently has 63 rows (61 filled, 2 rejected) per the prior audit, which doesn't match 33 either. |

**Are the three stores the same instance?** Cannot determine from inside the Repl. What I CAN say: this codebase has only one DB connection (`DATABASE_URL`), and that one connection currently holds 165 resolved recommendation rows. Whether Supabase is exposing the same physical Postgres via a different connector, or exposing a totally separate DB populated by a different writer, is invisible from here — you'd need to compare the `host` of `DATABASE_URL` against the host Supabase reports.

**Where the divergence comes from:**

1. **Different populations.** "Resolved recommendations" (165) ≠ "executed trades" (~33) ≠ whatever the Google Sheet is filtering on (~3). The Sheet may be hand-curated to only James-approved calls; the Supabase summary may filter on `live_trades` rows where `status='filled'` only; Postgres counts every auto-resolved rec including the 142 incorrect ones the Manila team may not consider "real trades."
2. **Stale / one-time export.** The Google Sheet and the Supabase view have no live wire from this codebase. If either was last populated before 2026-05-20, it would have missed the entire wave of auto-resolutions that came in during the freeze window (the Postgres `resolved` count grew dramatically over the last two weeks per the 5-28 status reconciliation).
3. **Different filter logic.** `recommendations.type = 'trade' AND outcome IS NOT NULL` (Postgres) is a different query than what either external view is likely running.

**Recommendation (no change made):** For a calibration analysis of the AI's predictive accuracy, **use the Postgres `recommendations` table on this Repl** as the single authoritative source for `(prediction-time confidence, prediction-time edge, asset_class, direction) → (outcome, paper_return)`. Reasoning:

- It is the only store this codebase writes to. Whatever is in Postgres is what the system actually predicted and what the resolver actually scored.
- Every field a calibration harness needs (`confidence`, `convictionScore`, `edge`, `aiProbability`, `direction`, `assetClass`, `outcome`, `paperReturn`) lives on the same row — no joins needed, no risk of mismatched dates.
- The Google Sheet and Supabase view are downstream artifacts whose pipelines are not visible from inside this Repl and whose freshness cannot be verified. Using either of them as the calibration ground truth would mean calibrating against a population the live system is no longer producing.

Caveat: the Postgres set is calibratable for the *prediction* pipeline, not for the *coach* pipeline. The coach has its own broken confidence story (§3) and cannot be calibrated against either Postgres or the external views — coach replies are not joinable to outcomes anywhere.

---

## 6. Calibration Readiness

**What a calibration harness would need:**

| Need | Present? | Where (or what's missing) |
|---|---|---|
| Prediction-time confidence stored per call | **Yes** | `recommendations.confidence` (integer 0–100, the model's emitted value). Persisted at recommendations.ts:430. |
| Prediction-time conviction stored per call | **Yes (but degenerate)** | `recommendations.conviction_score`. See §2 — values cluster in `[-8, +5]`, so the field exists but has no usable spread. |
| Prediction-time `edge` stored per call | **Yes** | `recommendations.edge` (float). |
| Prediction-time `aiProbability` stored per call | **Yes** | `recommendations.ai_probability` (float). |
| Asset class on resolved rows | **Yes** | `recommendations.asset_class` (text). Set at insert time from `rec.sector` (recommendations.ts:371, 421). Populated on the same row that later gets `outcome` set, so a calibration query can `GROUP BY asset_class`. |
| Direction on resolved rows | **Yes** | `recommendations.direction` (text). |
| Outcome on resolved rows | **Yes** | `recommendations.outcome` (`'correct' | 'incorrect' | 'partial'` or NULL). |
| Paper return on resolved rows | **Partial** | `recommendations.paper_return` — populated for `price` and `kalshi` resolution paths; NULL for `polymarket` and `macro` (§5). |
| Clean join from resolved outcome → confidence at call | **Yes** | Same row. `SELECT confidence, conviction_score, edge, asset_class, direction, outcome, paper_return FROM recommendations WHERE outcome IS NOT NULL` returns everything in one shot. |
| Coach-reply confidence at message time | **No** | `coach_messages.confidence` exists as a column but is always written as the hardcoded `0.75` (§3). The model's emitted `CONFIDENCE: 0-100` value is never parsed off the response. **Real coach confidence has never been recorded anywhere.** |
| Join from a resolved outcome → the coach reply that may have advised on it | **No** | `coach_messages` has no rec-id FK, no asset-id FK, no question→asset linkage other than free-text. The schema is `(id, user_id, role, content, recommendations jsonb, risk_assessment, confidence, created_at)`. The `recommendations` jsonb on a coach reply holds the *coach's bullet-list reply text*, not pointers to `recommendations.id` rows. |
| `coach_messages` rows populated at all | **No (in this DB)** | `SELECT COUNT(*) FROM coach_messages` = 0 (confirmed in §C of the 2026-05-28 coach audit and re-confirmed today). |

**Net for a recommendation-side calibration harness:** **all required fields are present on a single table** (`recommendations`). A harness could ship today reading from this Repl's Postgres alone.

**Net for a coach-side calibration harness:** **two foundational pieces are absent** — (a) the model's real confidence is not parsed or stored anywhere, and (b) there is no schema linkage from a coach reply back to the recommendation(s) it discussed. Both would need to land before any coach calibration is even mathematically possible.

---

## 7. Duplication — current open-rec state

Top 5 `(asset_id, direction)` clusters among open recommendations (`outcome IS NULL`), live query against this Repl's Postgres on 2026-05-28:

| Rank | `asset_id` | Symbol | Direction | Open count |
|---:|---|---|---|---:|
| 1 | `NULL` | — | LONG | **937** |
| 2 | 8 | FED-CUT | YES | **440** |
| 3 | 1 | BTC | YES | **432** |
| 4 | 6 | GLD | LONG | **413** |
| 5 | `NULL` | — | WATCH | **389** |

vs. the 2026-05-28 morning status reconciliation (which showed 937 / 428 / 420 / 401 / 389), three of the clusters have grown today: FED-CUT YES +12, BTC YES +12, GLD LONG +12. The two `NULL`-asset clusters are unchanged. Suggests one further scan cycle has fired since this morning, adding roughly one rec to each of the three top tracked clusters but contributing nothing new to the dedup signal.

`SCAN_DEDUP_INVESTIGATION.md` still does not exist; no deduplication code exists in `services/recommendations.ts`, `services/scheduler.ts`, or anywhere else under `artifacts/api-server/src/` (re-checked today: `rg -ln "dedup|deduplicat"` over the api-server returns zero matches).

---

## 8. Rebuild Readiness Summary

Three known breaks, what each touches, and the dependencies / risks each carries. **No fix proposed.**

1. **Confidence constant in the coach reply** — `artifacts/api-server/src/services/coach.ts:395` (`const confidence = 0.75;`) and the adjacent parser block (coach.ts:398–424) that locates `CONFIDENCE:` but never reads its value. A rebuild would need to (a) extract the model's number with a regex against `afterRisk.slice(confIdx + "CONFIDENCE:".length)`, (b) normalize to 0–1, (c) return it in place of the constant, (d) the constant is also returned in the catch-block fallback at coach.ts:441 (`confidence: 0.3`) — that path would need a deliberate decision too. **Dependency / risk:** the `CoachAnalyzeResponse` shape in `lib/api-zod/src/generated/api.ts:383` types `confidence` as `number` already, so the wire contract does not change shape, but `confidence` is currently a hardcoded scalar everywhere it's consumed downstream (frontend coach card likely renders "75%" as a static badge) — a UI rebuild may need to handle the now-variable range. The `coach_messages.confidence` column is `double precision` and already holds nullable values, so DB-side no migration is required.

2. **Coach blind to the recommendation's reasoning** — `artifacts/api-server/src/services/coach.ts:265–302` (`buildTopOpportunities()`). The function currently emits two lines per rec (`<title>: conviction N, edge ±N` + the one-line `edgeExplanation`). A rebuild would extend the `.select()` to include `bearCase`, `why` jsonb, `historicalContext`, `entryTrigger`, `urgencyReason`, `confidenceRationale`, and emit them inside the prompt block consumed by `getCoachAnalysis()` at coach.ts:326–351. **Dependency / risk:** the `COACH_PROMPT` system prompt (coach.ts top) currently says `"Balanced — always present bull AND bear cases"` as its only nuance instruction — feeding richer rec context will likely require also tightening the prompt to instruct the coach how to *use* the bear case (otherwise the additional tokens may just lengthen replies without changing tone), and the `max_tokens: 2048` budget at coach.ts:365 will need to be reconsidered if per-rec context grows. No DB migration required; no API contract change required (the prompt is internal).

3. **Dead `conviction_score`** — formula at `artifacts/api-server/src/services/recommendations.ts:395–396` (`confidenceWeight × edge`), with the underlying `edge` computed at recommendations.ts:382–393 from the matched asset's `aiProbability`. The deepest break is upstream of the formula: the SCORING_PROMPT in `artifacts/api-server/src/services/scoring.ts:6–39` does not push the model away from baseline 50, so `aiProbability − 50` collapses. A rebuild would need to touch either the scoring prompt (to demand calibrated probabilities with reference base rates) or the conviction formula (to normalize against the actual realized distribution) or both. **Dependency / risk:** `recommendations.conviction_score` is read by `buildTopOpportunities()` (coach.ts:276) as the ordering key and by `coach.ts:284-287` for display, and by `adaptive-learning.ts` indirectly via `recommendations` rows. If the formula's units / range change, the coach's "top opportunities" ordering will flip, and any UI that buckets conviction (`POST_UAT_POLISH.md` notes a "Scanner conviction display" that was descoped) will see the meaning of the numbers move. The frontend Recommendation card type in `lib/api-zod` exposes `convictionScore: number` — type unchanged, but display logic downstream may need to be re-anchored. No DB migration required; the column is already `double precision`.

**Cross-cutting risk on all three:** any change to a field on the `recommendations` row that is also exposed in the OpenAPI contract (`lib/api-spec/openapi.yaml`) will require regenerating the typed client (`pnpm --filter @workspace/api-spec run codegen` — see `pnpm-workspace` conventions). `conviction_score` and `confidence` are both already in the contract; adding new rec fields to the coach context (item 2) does NOT change the contract because that data flow is server-internal (only the coach's response shape is API-visible).
