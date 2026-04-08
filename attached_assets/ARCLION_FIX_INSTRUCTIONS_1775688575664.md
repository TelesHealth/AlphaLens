# Arclion — Replit Bug Fix Instructions
## AlphaLens Phase 1 Bug Report V2 · April 2026
**Internal codename:** AlphaLens | **Company:** Arclion

---

## READ THIS FIRST — Project Context

This is a pnpm workspace monorepo. Before making any fixes:
- The API server is at `artifacts/api-server/`
- Services are in `artifacts/api-server/src/services/`
- Always run `pnpm run typecheck` after every change
- Zero TypeScript errors must be confirmed before any fix is considered complete
- Reference `ALPHA_LENS_v2.xlsx` sheet "PHASE 1 BUG REPORT V2" for full bug details

---

## Bug Status Summary

| # | Severity | Title | Status |
|---|----------|-------|--------|
| V2-1 | P3 | Unterminated JSON string on generating recommendations | Not fixed |
| V2-2 | P3 | Expected double-quoted property on generating recommendations | Not fixed |
| V2-3 | P2 | Radar scan count is zero | Not fixed |

---

## Fix 1 — V2-1 and V2-2: JSON Parsing Failures in Recommendations

**Affected file:** `artifacts/api-server/src/services/recommendations.ts`

**Root cause:** Both bugs share the same root cause. The JSON extraction
from Claude's response is not robust enough. Two things are happening:

1. The `max_tokens` limit is too low — Claude hits the ceiling mid-sentence,
   producing truncated and unterminated JSON (V2-1).
2. Claude occasionally formats property names without double quotes when the
   prompt does not strictly enforce JSON-only output (V2-2). The bug report
   notes it "appears only in some AI responses" — the hallmark of
   non-deterministic formatting.

Both bugs emerged because the recommendation engine is now actually calling
Claude after the V1 model fix. These code paths were never reached before.

**Prompt for Replit AI — paste this exactly:**

```
In artifacts/api-server/src/services/recommendations.ts, make the
following three changes:

1. Find every place where JSON.parse() is called on Claude's response.
   Replace the parsing logic with a robust extraction function that:
   - Strips markdown code fences (```json and ```) before parsing
   - Wraps the parse in try/catch
   - Attempts to extract a JSON array using regex as a fallback
     if the first parse fails: match /\[[\s\S]*\]/
   - Returns an empty array [] if all attempts fail
   - Never throws an unhandled exception to the caller

2. Find the Claude API call for recommendations generation.
   Increase max_tokens to 4000 if it is currently lower than that.

3. Find the system prompt string for recommendations generation.
   Add this sentence to the very end of the prompt:
   "Return ONLY valid JSON array. No markdown. No preamble.
   No trailing commas. No single quotes. All property names
   must be double-quoted."

After making all three changes, run pnpm run typecheck and confirm
zero TypeScript errors.
```

**How to verify:**
- Run POST /api/recommendations/scan
- Wait 60 seconds, then run GET /api/recommendations/briefing
- The response must contain a non-empty recommendations array
- No JSON parse errors in the console
- Run the scan 3 times — V2-2 was intermittent, so multiple runs confirm the fix holds

---

## Fix 2 — V2-3: Radar Scan Count is Zero

**Affected file:** `artifacts/api-server/src/services/market-radar.ts`

**Root cause:** The radar is running but fetching prices for zero assets
when it should fetch for 12. This is a price fetching failure specific
to `market-radar.ts`.

The Bug V1-2 fix corrected Yahoo Finance price fetching in `market-data.ts`
by reading from `indicators.quote[0]` instead of `meta.previousClose`.
The radar service has its own separate price fetch logic that was not
updated at the same time — it is still using the stale data approach
and returning null or zero prices for all assets, so no spike checks run.

**Prompt for Replit AI — paste this exactly:**

```
In artifacts/api-server/src/services/market-radar.ts, make the
following two changes:

1. Add a console.log statement immediately after the price fetch
   completes (before spike detection runs) that prints:
   "Radar price fetch: X assets returned non-null price"
   where X is the count of assets with a price greater than 0.
   This confirms whether the fetch itself is working.

2. Find the Yahoo Finance price fetching logic inside market-radar.ts.
   Compare it to the corrected version in market-data.ts.
   In market-data.ts, the Bug V1-2 fix changed Yahoo Finance price
   reading from meta.previousClose or meta.regularMarketPrice to
   reading from indicators.quote[0] (the indicators array).
   Apply the same fix to market-radar.ts so both services use
   the same corrected fetch approach.
   If market-radar.ts imports a shared price fetch utility from
   market-data.ts, verify it is importing the updated version
   and not a cached or stale copy.

After making changes, run pnpm run typecheck and confirm zero errors.
Then restart the server and check the console log added in step 1
to verify the count is greater than zero before testing spike detection.
```

**How to verify:**
- Restart the project after the fix
- Within 5 minutes the radar cron job fires
- Console shows: `Radar price fetch: 12 assets returned non-null price` (non-zero)
- GET /api/radar/prices returns array with non-zero price values
- GET /api/radar/status shows `assetsMonitored: 18`

---

## V1 Bugs — Check Status Before Fixing

Bugs V1-3, V1-6, V1-7, V1-8, and V1-9 were not marked Resolved in the
original bug report and do not appear in V2. Run typecheck first. If it
returns zero errors, all TypeScript bugs are resolved — skip this section.

**Step 1 — Run typecheck first. Paste this prompt:**

```
Run pnpm run typecheck from the root directory and show me the complete
output including all errors and warnings. Do not fix anything yet —
just report what typecheck finds.
```

**Step 2 — Only apply the fix below if typecheck shows the specific error.**

### V1-3: Export ambiguity in api-zod

```
In lib/api-zod/src/index.ts, find the duplicate export of GetSignalsParams
that causes a naming collision with the Zod const of the same name in
generated/api.ts. Export it as a type alias named GetSignalsParamsType
instead. Update any file that imports GetSignalsParams from api-zod to
use the new name GetSignalsParamsType.
Run pnpm run typecheck to confirm zero errors.
```

### V1-6: Missing @types/node

```
Run: pnpm add -D @types/node --filter @workspace/api-server
Then in artifacts/api-server/tsconfig.json, add "node" to the types
array under compilerOptions.
Run pnpm run typecheck to confirm the "cannot find node type library"
error is resolved.
```

### V1-7: Null vs string type mismatch in platform router

```
In artifacts/api-server/src/services/platform-router.ts, find the
getBestPlatform function. Update its parameter types to accept
string | null | undefined for assetClass and sector instead of plain string.
Add nullish coalescing where these values are used:
  (rec.assetClass ?? '').toLowerCase()
  (rec.sector ?? '').toLowerCase()
Also update artifacts/api-server/src/routes/trading.ts if it calls
getBestPlatform and passes potentially null values.
Run pnpm run typecheck to confirm zero errors.
```

### V1-8: Missing AbortError from p-retry

```
In lib/integrations-anthropic-ai/src/batch/utils.ts, find the import
statement for p-retry. Change it to include the named AbortError export:
  import pRetry, { AbortError } from 'p-retry';
Run pnpm run typecheck to confirm zero errors.
```

### V1-9: Missing queryKey in TanStack Query v5 hooks

```
In artifacts/alpha-lens/src/pages/briefing.tsx and
artifacts/alpha-lens/src/pages/market-details.tsx, find every
useQuery() call. TanStack Query v5 requires queryKey in every call.
Add a queryKey array to each hook that does not have one.
Example: useQuery({ queryKey: ['briefing'], queryFn: ... })
Run pnpm run typecheck to confirm zero errors.
```

---

## Fix Completion Checklist

After all fixes are applied, verify every item before handing back to QA:

| # | Verification step | Pass / Fail |
|---|-------------------|-------------|
| 1 | `pnpm run typecheck` returns zero errors | |
| 2 | POST /api/recommendations/scan returns `{status: "scan_started"}` immediately | |
| 3 | GET /api/recommendations/briefing returns non-empty recommendations array after 60s | |
| 4 | Scan run 3 times — no JSON parse errors in console on any run | |
| 5 | Console shows `Radar price fetch: X assets` with X > 0 | |
| 6 | GET /api/radar/prices returns array with non-zero price values | |
| 7 | GET /api/radar/status shows `assetsMonitored: 18` | |
| 8 | GET /api/healthz returns `{status: "ok"}` | |
| 9 | All 3 scheduler jobs visible in startup log (markets, recommendations, radar) | |

**When all 9 checks pass:** hand back to Charlize and the Philippines QA
team to begin Phase 2 functional testing.

---

*Arclion · Internal Bug Fix Document · Confidential · April 2026*
