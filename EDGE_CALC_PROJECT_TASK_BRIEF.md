# Edge Calculation Improvements — Project Task Brief

**Source spec:** `attached_assets/ARCLION_EDGE_IMPROVEMENTS_PROMPT_1777988011068.md` (May 2026)
**Audit date:** 2026-05-12 against `main` HEAD `f75cc1a`
**Status:** Most of the spec is already merged. This brief reflects the *actual* remaining gap, not the original 9-task plan.

---

## TL;DR

| Task | Original spec | Actual status on `main` |
|---|---|---|
| T001 | DB schema additions | ✅ **DONE** — all 4 columns exist in schema *and* in DB (verified `\d recommendations`) |
| T002 | Insert logic w/ `computeEdgeAndConviction` | ✅ **DONE** — `services/recommendations.ts:378-441` already branches by asset class and sets all 5 derived fields |
| T003 | Outcome resolver uses `assetPriceAtCall` | ✅ **DONE** — `outcome-resolver.ts:438-449` prefers `assetPriceAtCall`, falls back to `marketPrice` |
| T004 | `refreshRecommendationEdges()` in market-data | ✅ **DONE** — `market-data.ts:375` exists, called from `doRefresh()` at line 370 |
| T005 | Routes `edgeAgeMinutes` + sort by `convictionScore` | ✅ **DONE** — `routes/recommendations.ts:164,180` and `services/recommendations.ts:714,726` |
| T006 | OpenAPI + codegen | ✅ **DONE** — all 5 Recommendation fields + 3 LeaderboardStats fields in `openapi.yaml`, generated types in sync (`api-client-react/src/generated/api.schemas.ts:334-339`) |
| T007 | Leaderboard backend stats | ✅ **DONE** — `routes/leaderboard.ts:132-163,236,275-277` computes `avgConvictionScore`, `highConvictionWinRate (>15)`, `lowConvictionWinRate (<10)`, sorts by conviction |
| T008 | Frontend display | ⚠️ **PARTIAL** — briefing ✅, leaderboard ✅, **scanner ❌** |
| T009 | Verification | ⏳ pending — typecheck currently clean, but smoke test of edge refresh loop end-to-end not run |

**DB sanity check:** 4914 total recs, 4787 have `conviction_score`, 4787 have `edge_type` (3825 `directional_conviction` + 962 `probability_gap`), 3818 have `assetPriceAtCall`. **127 legacy rows have NULL `edge_type`/`conviction_score`** — 116 of those are still open (`outcome IS NULL`).

---

## Files touched (overlap risk vs UAT hot-fix)

This is the full set across all 9 original tasks. **Bold = already merged on `main`** (no further changes needed in scope; listed for overlap awareness only). *Italic = remaining work.*

| File | Status | Overlap risk if UAT P1 lands |
|---|---|---|
| `lib/db/src/schema/recommendations.ts` | **DONE on main** | LOW — schema is stable; UAT hot-fix unlikely to touch it |
| `artifacts/api-server/src/services/recommendations.ts` | **DONE on main** (insert + getCurrentBriefing) | **HIGH** — 782 lines, central to scoring; any P1 around edge/scoring lands here |
| `artifacts/api-server/src/services/outcome-resolver.ts` | **DONE on main** | MED — 736 lines, touched if a P1 around paper return surfaces |
| `artifacts/api-server/src/services/market-data.ts` | **DONE on main** (refresh loop) | MED — touched if refresh-cycle bug surfaces |
| `artifacts/api-server/src/routes/recommendations.ts` | **DONE on main** | LOW |
| `artifacts/api-server/src/routes/leaderboard.ts` | **DONE on main** | LOW |
| `lib/api-spec/openapi.yaml` | **DONE on main** | LOW |
| `lib/api-client-react/src/generated/*` | **DONE on main** (codegen output) | regenerated, not hand-edited |
| `lib/api-zod/src/generated/*` | **DONE on main** (codegen output) | regenerated, not hand-edited |
| `artifacts/alpha-lens/src/pages/briefing.tsx` | **DONE on main** | LOW |
| `artifacts/alpha-lens/src/pages/leaderboard.tsx` | **DONE on main** | LOW |
| *`artifacts/alpha-lens/src/pages/scanner.tsx`* | **GAP** | **HIGH if scope expanded** — see Open Question below |
| *`artifacts/api-server/src/services/market-data.ts`* | **GAP** (small backfill addition) | overlaps with HIGH-risk row above |

**Net overlap risk vs UAT:** **LOW**. The remaining gap touches only `scanner.tsx` (a frontend page no other UAT P1 is likely to touch) and a tiny addition to the existing `refreshRecommendationEdges()` body in `market-data.ts`. The two HIGH-risk files (`recommendations.ts`, `market-data.ts`) are *already merged for the Edge Calc work* — anything UAT touches there will be a separate concern, not an Edge Calc conflict.

---

## Remaining work (proposed slim plan)

### R1: Document scanner-conviction descope in POST_UAT_POLISH.md
- **Blocked By:** []
- **Files:** `POST_UAT_POLISH.md` (append a new section, do not touch `scanner.tsx`)
- **Decision (locked):** the original spec assumed Scanner = recommendations view. Scanner is now a markets-list page. Conviction is already surfaced on Briefing and Leaderboard, which is what UAT exercises. Forcing a new Recommendations tab onto Scanner the week of UAT introduces an untested surface for no real product gain.
- **Change:** append the following section to `POST_UAT_POLISH.md`:
  > ## Scanner conviction display — descoped
  > Spec (`ARCLION_EDGE_IMPROVEMENTS_PROMPT_1777988011068.md` Problem 4) assumed scanner = recommendations view. Scanner now functions as a markets list (`useListMarkets`) and has no concept of conviction. Conviction is already prominent on Briefing and Leaderboard. Revisit post-UAT if a "Recommendations" subview on Scanner is desired; until then, treat as N/A.
- **Acceptance:** the section appears verbatim at the bottom of `POST_UAT_POLISH.md`. **No changes to `scanner.tsx`.**

### R2: Backfill NULL `edge_type` / `conviction_score` for 116 open recs
- **Blocked By:** []
- **Files:** `artifacts/api-server/src/services/market-data.ts` (extend existing `refreshRecommendationEdges`)
- **Change:** in the loop, when `rec.edgeType` is null, derive it from `rec.assetClass` (`prediction` → `probability_gap`, else `directional_conviction`) and write it alongside `convictionScore`. Same single UPDATE as today; just adds two more columns when missing.
- **Acceptance:** After one refresh cycle, `SELECT count(*) FROM recommendations WHERE edge_type IS NULL AND outcome IS NULL` returns 0. The 11 resolved-but-NULL legacy rows stay NULL (intentional; they're closed and not worth retroactively scoring).

### R3: Verification
- **Blocked By:** [R1, R2]
- **Steps:**
  1. `pnpm run typecheck` — zero errors
  2. Restart `api-server` workflow; `POST /api/markets/refresh`; assert log line `"Edge refresh: updated N open recommendations"` and the NULL count above is 0
  3. Smoke test in browser: open Scanner page, confirm new column/badges render and don't break market list
  4. `GET /api/recommendations/briefing` — assert sample rec has `edgeAgeMinutes`, `edgeType`, `convictionScore`
  5. `GET /api/leaderboard` — assert `avgConvictionScore`, `highConvictionWinRate`, `lowConvictionWinRate` present

**Estimate:** R1 = 5 min (doc append); R2 = 30 min; R3 = 30 min. Total: ~1 hour of focused work.

---

## Scope discipline (hard rules for the Project Task agent)

- Only R1 (scanner POST_UAT_POLISH note), R2 (backfill in refreshRecommendationEdges), and R3 (verification) are in scope. Nothing else.
- If you find additional bugs, gaps, or "while I'm in there" improvements during the work, do NOT fix them. Note them in a new section at the bottom of `POST_UAT_POLISH.md` titled "Discovered during Edge Calc audit — review post-UAT" with file path + one-line description. Stop there.
- Do NOT modify `lib/api-spec/openapi.yaml` or regenerate codegen. Both are already in sync per the audit.
- Do NOT modify schema files. No `pnpm db push`.
- Do NOT touch `services/recommendations.ts`, `services/outcome-resolver.ts`, `routes/recommendations.ts`, `routes/leaderboard.ts`, `pages/briefing.tsx`, `pages/leaderboard.tsx` — all confirmed DONE per the audit and out of scope.
- If R3 verification fails: stop, report the failure with the diff and the failed verification step. Do not attempt remediation beyond reverting your own change.

---

## Rebase / merge plan

Project Task agents work in an isolated branch off `main` HEAD at task creation time. Two scenarios:

### Scenario A — `main` does not move during UAT (expected)
- Project Task completes R1+R2+R3 in its isolated environment.
- After UAT closes and you give all-clear, you click approve in the platform UI.
- Platform fast-forwards or auto-merges into `main`.
- Post-merge setup script runs (no DB migration needed — schema unchanged).
- I (main agent) verify on `main` and restart workflows.

### Scenario B — UAT P1 hot-fix lands on `main` mid-flight
- I hot-fix on `main` directly (your existing plan, P1 from a fresh sub-task off `main` HEAD if you prefer).
- Project Task's branch falls behind. **Conflict probability: LOW** — the gap-closure work touches `scanner.tsx` (HIGH-risk overlap with no other current work item) and a 5-line block inside the existing `refreshRecommendationEdges()` function in `market-data.ts`.
- When you're ready to merge the Project Task:
  - **If no conflict:** the platform's reconciliation merges it cleanly.
  - **If conflict (most likely on `market-data.ts`):** the platform surfaces the conflict; you reject the merge, ask me to refresh the brief from current `main`, and re-run the Project Task with the rebased context. **You will not have to manually resolve conflicts** — the Project Task will redo the work against the new HEAD.
- Worst case (P1 lands *inside* `refreshRecommendationEdges`): the R2 change is a 5-line addition that's trivial to redo from scratch. Do not invest in pre-emptive rebase tooling.

### Scenario C — Edge Calc work itself surfaces an issue during R3 verification
- Project Task agent reports failure with a diff showing what it tried.
- We do *not* merge. You ask me (main agent) to either:
  - revise the brief and respawn the Project Task, or
  - take ownership on `main` after UAT (if it's small enough that isolation no longer matters).

### Hard rules
- Project Task does NOT trigger any deployment. Vercel auto-deploys from `main`; Railway auto-deploys from `main`. **Project Task's branch is never deployed**, only its merge into `main` would be. You explicitly control that merge.
- No DB schema changes are in scope (T001 already done) → no `pnpm db push` runs in the Project Task → no risk to production DB schema.
- Backfill (R2) writes to **dev DB only** during the Project Task run. Production DB will get the same backfill organically when the next refresh cycle runs after the merge deploys.

---

## Scope locked — 2026-05-12

- Scanner scope decision: **Option 3 (descope)**. R1 reflects this.
- Backfill placement: **extend `refreshRecommendationEdges`** (idempotent forward-running). R2 reflects this.
- This brief is the contract. Project Task agent must not exceed it.
