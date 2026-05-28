# Coach Reasoning Audit — 2026-05-28

**Investigator:** Replit Agent (read-only run, per James's instructions)
**Scope:** Surface what the AI coach was told to do, what inputs it actually gets, what it told testers, and the reasoning behind specific losing calls.
**Hard rules honored:** no source files modified except this document. No project tasks, no git writes, no deploys. Empty queries are reported as empty — nothing inferred or fabricated. Verbatim quotes only where verbatim was requested.

---

## A. Coach System Prompt (verbatim) + is it built for uncertainty or confidence?

**File:** `artifacts/api-server/src/services/coach.ts`
**Model:** `claude-sonnet-4-6`
**Call params:** `max_tokens: 2048`. **No `temperature` is set** in the `anthropic.messages.create({…})` call (defaults to whatever the Anthropic SDK uses for Sonnet — not pinned in code).

**`COACH_PROMPT` constant — verbatim, complete:**

```
You are Arclion's elite AI trading coach, an investment intelligence platform.

IMPORTANT: You DO have access to live market data. Every user message includes a LIVE MARKET SNAPSHOT (real-time prices for major assets, AI vs market edges) and MACRO CONTEXT (Fed Funds Rate, CPI, Unemployment, GDP, prediction-market probabilities). NEVER tell the user you don't have access to current prices or real-time data — quote the numbers from the snapshot directly. The data is already there in the prompt below.

You provide personalized, actionable coaching to traders analyzing markets. Your tone is:
- Direct and confident, like a seasoned trading desk mentor
- Data-driven — reference specific numbers and evidence from the snapshot
- Balanced — always present bull AND bear cases
- Educational — explain WHY, not just WHAT

When analyzing a position, cover (briefly): edge assessment, key risk factors, position-sizing guidance, timing, and one line of historical context if relevant.

LENGTH BUDGET (CRITICAL — your reply must always finish all four sections below):
- Total response: roughly 800–1400 tokens. Always leave headroom so RECOMMENDATIONS, RISK, and CONFIDENCE are guaranteed to fit.
- It is BETTER to be brief and complete than long and truncated. If you only have room for 2 short paragraphs of analysis, write 2 short paragraphs and move on — never trail off mid-sentence.
- Prefer tight, information-dense sentences. No filler, no restating the question.

Structure your response as follows (ALL FOUR sections are mandatory and must always appear):
1. 2–3 focused paragraphs of analysis. Conversational but precise. Keep each paragraph to 3–5 sentences.
2. Then on a new line write "RECOMMENDATIONS:" followed by 3 actionable bullet points starting with "- " (each bullet one short sentence, ≤ 25 words).
3. Then on a new line write "RISK:" followed by a single-line risk assessment (e.g., "Medium — volatility elevated, position size carefully").
4. Then on a new line write "CONFIDENCE:" followed by a number 0-100.

MARKDOWN FORMATTING RULES (strict):
- Use only well-formed markdown. Every "**" opening MUST have a matching closing "**" with no spaces between the asterisks and the bolded word(s) (correct: **High**, incorrect: ** High** or High **).
- Never emit a stray "**" by itself or with trailing whitespace.
- Bullet lines must start with "- " (a hyphen and a space). Never use "**" as a bullet marker.
- Use plain words for emphasis when in doubt rather than risk unbalanced asterisks.
```

**Uncertainty vs. confidence — verbatim instruction lines that bear on this:**

- Tone is set as: `"Direct and confident, like a seasoned trading desk mentor"`.
- The only line that touches uncertainty / disconfirming evidence: `"Balanced — always present bull AND bear cases"`.
- There is **no** instruction to express epistemic uncertainty, to say "I don't know", to flag low-confidence scenarios, to surface base rates, or to note that a thesis could be wrong. There is **no** instruction to weight the bear case against the bull case or to refuse a call when evidence is mixed.
- The mandatory closing section is `"CONFIDENCE:" followed by a number 0-100` — i.e. every reply is required to commit to a numeric confidence figure.

**Footnote on what the user actually sees as "confidence":** the model is told to emit `CONFIDENCE: <0-100>` as section 4, but the server-side code at `services/coach.ts:395` then does:

```ts
const confidence = 0.75;
```

— a hard-coded `0.75`. The model's emitted `CONFIDENCE:` value is parsed off the response text (it's split out as part of the `RISK:` / `CONFIDENCE:` separation) but **the returned API field `confidence` is always 0.75**, regardless of what the model wrote. The `coach_messages` row likewise stores `0.75` for every coach reply (see Section C — table is empty, but this is what would have been written).

**Read:** the prompt asks for balance ("bull AND bear") in one line, but the surrounding tone direction ("Direct and confident", "seasoned trading desk mentor"), the mandatory `RECOMMENDATIONS:` bullet block, and the mandatory `CONFIDENCE: 0-100` closing all push the model toward committing to a directional, confident reply. There is no instruction that uncertainty itself is a valid output.

---

## B. Coach Inputs — does it receive full reasoning or only the headline call?

**Source: `getCoachAnalysis()` at `services/coach.ts:326`.**

The coach receives a `CoachInput` with three fields only:

```ts
interface CoachInput {
  assetId?: number | null;
  question: string;
  context?: string | null;
}
```

From those, the service assembles the user-message prompt by concatenating these blocks (verbatim from `services/coach.ts:331–351`):

1. **`buildMarketSnapshot(question)`** — top 5 assets by `alphaScore`, plus any assets whose `symbol` or `name` is mentioned in the question. For each: `name (symbol), price, AI prob %, market prob %, edge pts, direction`. **No bear case, no why-signals, no conviction reasoning.**
2. **`buildTopOpportunities()`** — top 3 **open** `trade`-type recommendations by `convictionScore`. For each it writes one line: `"<assetTitle>: conviction <N>, edge <±N>"` and **only the `edgeExplanation` string** if non-empty. It does NOT pass the `why` jsonb array, the `bearCase`, the `historicalContext`, the `entryTrigger`, the `urgencyReason`, the `headline`, or any other recommendation field.
3. **`buildLatestBriefing()`** — at most a 100-char excerpt of the most recent `dailyBriefings.summary`.
4. **`buildAssetContext(assetId)`** (only when the user asked about a specific asset) — that asset's `currentPrice`, `aiProbability`, `marketProbability`, `edge`, `direction`, `sector`, `region`, `aiSummary`, an optional Danelfin score line, an optional 60-day technical-analysis line (RSI / MACD / MA / Bollinger / overall), and up to 5 recent signal headlines.
5. **`fetchMacroContext()`** — Fed funds rate, CPI, unemployment, GDP, prediction-market probabilities.
6. **`input.context`** — whatever free-text context the caller passed (the React client may or may not pass anything here).

The blocks are joined and wrapped as:

```
--- LIVE DATA AVAILABLE ---
<blocks joined by blank lines>
--- END LIVE DATA ---

User question: <question>
```

**Direct answer to the question:**
The coach receives **the headline-level summary** of recommendations (title, conviction, edge, and at most the one-line `edge_explanation`). It does **NOT** receive the recommendation's `bear_case`, the `why` jsonb array of disconfirming/confirming signals, `historicalContext`, `entryTrigger`, `urgencyReason`, the `aiProbability` vs `confidence` split per rec, or the full `headline` analysis paragraph. So even if those fields are populated on the recommendation row (and §D shows they often are, including a real bear case), the coach has no way to surface them to the tester — they are not in its context window.

For the specific-asset path (`buildAssetContext`), the coach gets the **asset's** rolling state (price / prob / edge / direction / sector / one `aiSummary` blurb / recent signal headlines) — again, not the per-recommendation bear case or why-signals.

---

## C. Actual Coach Messages to Testers

**Status: NO TESTER DATA / EMPTY TABLE.**

Query on `coach_messages` (the table added on 2026-05-20 in commit `b32d1f7`):

```sql
SELECT COUNT(*) AS n, MIN(created_at) AS first, MAX(created_at) AS last FROM coach_messages;
-- n=0, first=NULL, last=NULL
```

Zero rows. No `user`-role messages, no `coach`-role messages, no date range. The DB this Repl is connected to has **no persisted coach conversations** — either because no authenticated user has used the coach since the table was added on 2026-05-20, or because this is a dev DB that does not carry the testers' conversation history.

Per the spec's instruction (*"If empty or you're on a dev DB with no tester data, say so and STOP this section — do not fabricate"*), this section ends here. No coach replies are quoted because none exist in this DB.

*Schema for reference (so James knows what would be there if the table were populated): `id, user_id, role ('user' | 'coach'), content (text), recommendations (jsonb), risk_assessment (text), confidence (float8), created_at (timestamp)`.*

---

## D. Reasoning Behind Losing Calls (verbatim)

### D.1 — Losing ETH LONG recommendations (5 quoted verbatim)

All 5 were entered at `asset_price_at_call = 2386.69` and resolved as `incorrect`. All 5 had `direction='LONG'`, `edge_type='directional_conviction'`. Paper return ranged $-10.37 to $-17.15.

---

**Rec id `3829`** — created 2026-04-30 09:02:38 UTC
- `ai_probability=58`, `confidence=72`, `conviction_score=0`, `edge=0`
- `asset_price_at_call=2386.69`, resolved at `1986.11`, `paper_return=-16.78`

**`headline` (verbatim):**
> The SEC's approval of spot ETH ETF staking marks a genuine structural shift — not noise. This creates a yield-bearing ETF product that directly competes with traditional fixed income, unlocking a wave of institutional demand. ETH is consolidating near $2,300 support with exchange outflows rising, suggesting accumulation is already underway ahead of a re-rating.

**`edge_explanation` (verbatim):** `The AI assigns 58.0% probability vs market's 2392.2, a 0.0-point directional edge.`

**`bear_case` (verbatim):**
> Pectra upgrade delays or technical bugs could damage sentiment. Broader macro deterioration (stagflation, equity sell-off) could overwhelm the catalyst. Inconsistent ETH ETF inflows signal retail hasn't yet piled in — if institutions also hesitate, the move stalls near $2,500.

**`historical_context` (verbatim):**
> In May 2024, the surprise approval of spot Bitcoin ETFs triggered a 40%+ BTC rally within 60 days. The ETH spot ETF approval in July 2024 added further momentum to altcoins. A staking feature approval is an order of magnitude more significant than simple spot approval, as it transforms ETH ETFs into yield instruments — analogous to the shift from non-dividend to dividend-paying equity products.

**`entry_trigger` (verbatim):** `N/A — Trade call. Enter at market or on any dip toward $2,200–$2,250 support zone.`
**`urgency_reason` (verbatim):** `SEC staking approval is a dated, specific catalyst with immediate implications for institutional ETH demand. Window to enter before mainstream coverage closes fast.`

**`why` jsonb (verbatim, each signal a list item):**
- `"SEC approves spot ETH ETF staking feature — first-ever yield-bearing crypto ETF product, structural demand catalyst"`
- `"ETH exchange outflows rising, indicating long-term holders accumulating near support rather than distributing"`
- `"DeFi TVL holds above $50B despite price weakness — network fundamentals remain intact"`
- `"AI prob (58%) aligns exactly with market prob (58%), meaning no overpricing of this catalyst yet — edge exists in timing"`
- `"Rate cut expectations (AI: 74%, Mkt: 32%) remain a powerful tailwind for risk assets if confirmed"`

---

**Rec id `3080`** — created 2026-04-27 10:02:45 UTC
- `ai_probability=58`, `confidence=72`, `conviction_score=0`, `edge=0`
- `asset_price_at_call=2386.69`, resolved at `2094.22`, `paper_return=-12.25`

**`headline` (verbatim):**
> The SEC's approval of a spot ETH ETF staking amendment framework is a structural catalyst that the market has not yet fully priced in. Combined with exchange outflows suggesting long-term holder accumulation and ETH holding the critical $2,300 support, this is a high-conviction setup. AI and market probabilities align at 58%, but the staking news is a fresh fundamental upgrade.

**`edge_explanation` (verbatim):** `The AI assigns 58.0% probability vs market's 2392.2, a 0.0-point directional edge.`

**`bear_case` (verbatim):**
> Pectra upgrade timeline uncertainty could dampen developer sentiment. If Bitcoin breaks below $75K, altcoins including ETH typically see amplified drawdowns of 20-30%. Spot ETH ETF inflows remain inconsistent, suggesting institutional conviction is not yet universal.

**`historical_context` (verbatim):**
> In November 2023, Ethereum rallied 85% over 6 weeks following the announcement that BlackRock had filed for a spot ETH ETF. A regulatory unlock of similar magnitude (staking approval) in January 2024 preceded another 120% move into the March 2024 peak. Regulatory clarity events have consistently been ETH's strongest price triggers.

**`entry_trigger` (verbatim):** `Current price $2,323 — position is active. Add on confirmed close above $2,500 for momentum confirmation.`
**`urgency_reason` (verbatim):** `SEC staking framework approval is a same-day catalyst. First-mover window before mainstream coverage drives retail FOMO is narrow — typically 48-72 hours.`

**`why` jsonb (verbatim):**
- `"SEC approves spot Ethereum ETF staking amendment — direct institutional demand catalyst not yet priced in"`
- `"ETH exchange outflows accelerating, indicating long-term holders pulling coins off exchanges (supply shock setup)"`
- `"ETH holding $2,300 key support with declining volatility — classic coil before breakout"`
- `"Ethereum DeFi TVL remains above $50B, confirming underlying network health despite price weakness"`
- `"AI prob (58%) matches market prob (58%) — no discount, but staking news is a post-score catalyst"`

---

**Rec id `2775`** — created 2026-04-23 10:02:59 UTC
- `ai_probability=62`, `confidence=72`, `conviction_score=2.9`, `edge=4`
- `asset_price_at_call=2386.69`, resolved at `2113.92`, `paper_return=-11.43`

**`headline` (verbatim):**
> The SEC's approval of spot Ethereum ETF staking amendments is a fundamental catalyst that the market is underpricing at current levels. ETH is down 2.95% today while this news represents a structural demand unlock — institutions can now earn yield on ETH held in ETFs, making it a far more attractive product than Bitcoin ETFs. AI prob at 62% leads market prob of 58%, adding a quantitative edge.

**`edge_explanation` (verbatim):** `The AI assigns 62.0% probability vs market's 2392.2, a 4.0-point directional edge.`

**`bear_case` (verbatim):**
> Broader risk-off from Fed prolonged pause or Strait of Hormuz escalation could overwhelm the crypto-specific catalyst. Regulatory reversal or legal challenge to the staking amendment could erase the thesis. BTC failing $75K support drags ETH lower regardless of fundamentals.

**`historical_context` (verbatim):**
> When the SEC approved spot Bitcoin ETFs in January 2024, BTC initially sold off 15% ('sell the news') before recovering and rallying 60%+ over the following 10 weeks. ETH's staking amendment approval is arguably more impactful because it adds a yield component absent from BTC ETFs — a closer analog is the launch of Ethereum futures ETFs in October 2021 which preceded a 60-day 80% rally in ETH from ~$3,200 to $4,800.

**`entry_trigger` (verbatim):** `Buy at current levels ($2,317) with stop below $2,100. Add on confirmed daily close above $2,500.`
**`urgency_reason` (verbatim):** `Catalyst just approved — institutional flows into staking-enabled ETH ETFs begin immediately. First-mover window is open now before price fully reprices the news.`

**`why` jsonb (verbatim):**
- `"SEC spot ETH ETF staking amendment approved — yields on institutional ETH holdings now possible, dramatically improving ETF product attractiveness vs BTC ETFs"`
- `"AI model assigns 62% probability vs market 58% — a 4-point edge on a high-impact catalyst event"`
- `"Price down 2.95% today despite bullish news, suggesting selling pressure is exhausting against a structural positive — classic buy-the-dip-on-catalyst setup"`
- `"Bitcoin Spot ETF inflows remain persistently positive (confidence 0.78) — ETH staking approval extends this institutional tailwind directly to ETH"`
- `"Post-halving BTC supply shock context and rising crypto sentiment provide a supportive macro backdrop for altcoin breakout leadership"`

---

**Rec id `2543`** — created 2026-04-22 22:07:29 UTC
- `ai_probability=62`, `confidence=72`, `conviction_score=2.9`, `edge=4`
- `asset_price_at_call=2386.69`, resolved at `1977.34`, `paper_return=-17.15`

**`headline` (verbatim):**
> The SEC just approved spot Ethereum ETF staking amendments — a fundamental upgrade to ETH's investment thesis that was previously a key deterrent for institutional buyers. ETH is up 3.93% today, AI prob at 62% vs market 58%, and the staking approval removes a major structural overhang. This is a regime change event, not a news blip.

**`edge_explanation` (verbatim):** `The AI assigns 62.0% probability vs market's 2392.2, a 4.0-point directional edge.`

**`bear_case` (verbatim):**
> Staking yields may attract inflows more slowly than expected if ETF products take months to update their structures. BTC dominance could continue absorbing capital at ETH's expense. Broader risk-off from geopolitical escalation in the Strait of Hormuz could override the catalyst.

**`historical_context` (verbatim):**
> In June 2023, when the SEC acknowledged BlackRock's spot Bitcoin ETF application, BTC rose 20% in two weeks and ETH followed with a 15% move as correlation traders piled in. The ETH staking approval is comparably significant as an institutional access upgrade — similar demand compression expected over the following 4–6 weeks.

**`entry_trigger` (verbatim):** `Already triggered — enter on any intraday pullback toward $2,300–$2,350 for better risk/reward`
**`urgency_reason` (verbatim):** `Staking approval is a same-day catalyst; delay risks chasing a further 10–15% move before consolidation`

**`why` jsonb (verbatim):**
- `"SEC approval of spot Ethereum ETF staking amendment is a tier-1 catalyst — staking yield now accessible to institutional ETF holders, dramatically increasing product attractiveness"`
- `"AI prob 62% vs market 58% — 4-point edge with asymmetric upside given the magnitude of the staking catalyst not yet fully priced"`
- `"ETH up 3.93% in 24h showing immediate market recognition, but staking yield demand flows will take weeks to fully materialize"`
- `"Bitcoin ETF inflow tailwind spills over to ETH — correlated institutional on-ramp now has staking yield sweetener"`
- `"Sentiment recovering from fear toward neutral/greed — ETH historically outperforms BTC in mid-cycle risk-on rotations"`

---

**Rec id `2521`** — created 2026-04-22 21:32:55 UTC
- `ai_probability=62`, `confidence=71`, `conviction_score=2.8`, `edge=4`
- `asset_price_at_call=2386.69`, resolved at `2139.27`, `paper_return=-10.37`

**`headline` (verbatim):**
> The SEC's approval of a spot Ethereum ETF staking framework is a fundamental regime change for ETH — it unlocks institutional yield-bearing exposure that was previously impossible. Combined with an AI edge over market pricing (62% vs 58%) and broader crypto tailwinds from BTC ETF inflows, ETH is the highest-conviction asymmetric trade in crypto right now.

**`edge_explanation` (verbatim):** `The AI assigns 62.0% probability vs market's 2392.2, a 4.0-point directional edge.`

**`bear_case` (verbatim):**
> If BTC fails to break $80K resistance and reverses, ETH typically sells off harder. Global regulatory uncertainty (confidence 0.65 bearish signal) could resurface and cap upside. Global trade tensions could trigger broader risk-off.

**`historical_context` (verbatim):**
> In January–February 2024, when BTC spot ETF approvals drove sustained inflows, ETH lagged by ~3 weeks before outperforming BTC with a 45% rally from $2,200 to $3,200. The staking ETF approval in 2026 is an analogous structural catalyst.

**`entry_trigger` (verbatim):** `Long at market ($2,396) — catalyst is live. Add on any pullback to $2,200–$2,300 support zone.`
**`urgency_reason` (verbatim):** `SEC staking approval is a same-day catalyst; institutional products will begin filing within 48–72 hours, creating immediate demand pressure`

**`why` jsonb (verbatim):**
- `"SEC spot ETH ETF staking framework approval is a direct institutional demand catalyst — staking yield makes ETH ETFs genuinely competitive vs bonds"`
- `"AI prob 62% vs market prob 58% — AI leads market, consistent with ETH being underpriced relative to its new regulatory status"`
- `"BTC spot ETF inflows (confidence 0.78–0.80) historically lift ETH with a lag of 1–3 weeks as capital rotates down the crypto cap stack"`
- `"Post-halving BTC supply shock tightening (confidence 0.75) compresses available crypto supply broadly, supporting ETH price"`
- `"Market sentiment recovering toward greed territory provides near-term momentum tailwind"`

---

### D.2 — Losing GLD recommendations

**Status: NO RESOLVED LOSING GLD CALLS EXIST IN THIS DB.**

```sql
SELECT outcome, direction, COUNT(*) FROM recommendations WHERE asset_id=6 GROUP BY outcome, direction;
-- (NULL, 'LONG', 402)
-- (NULL, 'SHORT', 27)
```

All 429 GLD recommendations (`asset_id=6`) have `outcome IS NULL` — none have been resolved yet (no `correct`, `incorrect`, or `partial`). There is therefore no stored reasoning for "losing GLD trades" to quote in this DB. Per the spec's no-fabrication rule, this sub-section ends here.

(Note: the brief mentioned "GLD was -$21.70, the worst non-FED-CUT line". That figure is not reproducible from this DB's resolved set — possibly an aggregate from the production DB or from the briefing summary, but no per-rec loss is recorded against GLD here.)

---

## E. Conviction Calibration Table

Resolved recommendations only (`outcome IS NOT NULL`, n=165). Win rate = `correct / total resolved` per bucket.

### E.1 — by `conviction_score`

| Bucket | Resolved | Correct | Incorrect | Partial | Win rate |
|---|---:|---:|---:|---:|---:|
| `0–29` | 154 | 11 | 137 | 6 | **7.14 %** |
| `NULL` | 11 | 6 | 5 | 0 | **54.55 %** |
| **All** | **165** | **17** | **142** | **6** | **10.30 %** |

**Distribution of `conviction_score` across resolved recs:** `min = -7.7`, `max = 4.3`, `avg = 0.40`, 11 rows NULL. **No resolved recommendation has a conviction score above 4.3.** The "60-69 / 70-79 / 80+" buckets the brief asked about do not exist in the resolved set — every scored rec falls into `0–29` (and most cluster near zero or below).

### E.2 — by `confidence` (this is the field shown in the UI as "Confidence %")

| Bucket | Resolved | Correct | Incorrect | Win rate |
|---|---:|---:|---:|---:|
| `50–59` | 2 | 0 | 2 | **0.00 %** |
| `60–69` | 55 | 8 | 44 | **14.55 %** |
| `70–79` | 108 | 9 | 96 | **8.33 %** |
| **All** | **165** | **17** | **142** | **10.30 %** |

**Direction of the correlation:** the highest-confidence bucket (`70–79`, n=108) has the **lowest** win rate (8.33 %), and the middle bucket (`60–69`, n=55) has the highest (14.55 %). Confidence and being-right move in **opposite** directions across the resolved set.

### E.3 — ETH (`asset_id=2`) specifically

| Outcome | Count | Avg `conviction_score` | Avg `confidence` | Avg `paper_return` |
|---|---:|---:|---:|---:|
| `incorrect` | 14 | 2.5 | 71.9 | −$13.55 |
| `NULL` (open) | 395 | 2.3 | 56.4 | — |

There are **zero correct ETH calls in the resolved set** — every resolved ETH recommendation lost. The losing ETH cluster carried an average `confidence` of 71.9 (the highest confidence band in the table).

### E.4 — Worst single-trade losses across all assets (top 10)

| Rec id | Symbol | Direction | Conviction | Confidence | Paper return |
|---|---|---|---:|---:|---:|
| 1422 | (NULL) | SHORT | NULL | 58 | −$206.44 |
| 1548 | (NULL) | SHORT | NULL | 65 | −$197.50 |
| 867 | (NULL) | LONG | 0 | 70 | −$17.15 |
| 1024 | (NULL) | LONG | 0 | 68 | −$17.15 |
| 2348 | ETH | LONG | 2.8 | 70 | −$17.15 |
| 2105 | ETH | LONG | 2.8 | 71 | −$17.15 |
| 1132 | (NULL) | LONG | 0 | 72 | −$17.15 |
| 2543 | ETH | LONG | 2.9 | 72 | −$17.15 |
| 2358 | ETH | LONG | 2.7 | 68 | −$17.15 |
| 1113 | (NULL) | LONG | 0 | 70 | −$17.15 |

7 of the worst 10 single-trade losses carry `confidence ≥ 70`. The two worst single-trade losses (rec ids 1422 / 1548, losses ~$200 each) have `NULL` `asset_id` — they are not attached to any tracked asset in the `assets` table.

---

## F. Plain-English Read

Based only on what's in this DB and codebase: **yes, the coach is built to present theses as confident**, and **no, conviction does not correlate with being right** — if anything the relationship is inverted. The coach's system prompt instructs a "direct and confident, like a seasoned trading desk mentor" tone and mandates that every reply close with a `CONFIDENCE: 0-100` number, while the only counter-balancing instruction is the single line "always present bull AND bear cases" — there is no instruction permitting "I don't know" or weighting disconfirming evidence against the bull thesis. The coach also never sees the per-recommendation `bear_case`, `why`-signals, `historical_context`, `entry_trigger`, or `urgency_reason` fields — it only gets the asset-level headline numbers and the one-line `edge_explanation` of the top three open recs — so even when the recommendation row itself contains a real bear case (as in all five ETH losers in §D), the coach has no way to surface that nuance to the tester. On calibration: across the 165 resolved recs in this DB the overall win rate is 10.30 %, the highest-confidence bucket (70–79, n=108) wins 8.33 % vs the 60–69 bucket's 14.55 %, every resolved ETH call lost (14/14 incorrect at avg confidence 71.9), and the displayed `confidence` field shown to testers is not even the model's emitted number — server code hard-codes the returned `confidence` to `0.75` on every successful coach reply, so any "75 %" the tester sees in the coach UI is a constant, not a measurement.
