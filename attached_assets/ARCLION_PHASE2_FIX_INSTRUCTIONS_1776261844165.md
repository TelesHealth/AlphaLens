# Arclion — Replit Bug Fix Instructions
## AlphaLens Phase 2 Bug Report · April 2026
**Internal codename:** AlphaLens | **Company:** Arclion

---

## READ THIS FIRST — Project Context

This is a pnpm workspace monorepo. Before making any fixes:
- API server: `artifacts/api-server/`
- Services: `artifacts/api-server/src/services/`
- Frontend pages: `artifacts/alpha-lens/src/pages/`
- Frontend components: `artifacts/alpha-lens/src/components/`
- Always run `pnpm run typecheck` after every change
- Zero TypeScript errors required before any fix is complete
- Reference `ALPHA_LENS__1_.xlsx` sheet "PHASE 2 BUG REPORT" for full details

---

## Bug Summary — 23 Total

| # | Severity | Title | Status |
|---|----------|-------|--------|
| 7  | P1 | BTC/ETH/SOL prices not fresh | Not fixed |
| 8  | P1 | 404 error on closing trade on frontend | Not fixed |
| 11 | P1 | Edge, AI Probability, Market Price NULL in recommendations | Not fixed |
| 14 | P1 | pctChange field in radar prices is null | Not fixed |
| 6  | P2 | CoinGecko API 429 rate limit error | Monitoring |
| 23 | P2 | Most fields in radar alerts are null | Not fixed |
| 2  | P3 | Incorrect edge badge color | Not fixed |
| 5  | P3 | Signals not clickable or expandable | Not fixed |
| 9  | P3 | Coach recommendations array empty, riskAssessment null | Not fixed |
| 13 | P3 | byType in radar history missing volume_anomaly | Not fixed |
| 16 | P3 | Market refresh lock missing | Not fixed |
| 17 | P3 | Radar scan lock missing | Not fixed |
| 18 | P3 | Recommendations scan lock missing | Not fixed |
| 19 | P3 | No manual add/remove in watchlist | Not fixed |
| 21 | P3 | Missing chain map visualization on /radar | Not fixed |
| 1  | P4 | Homepage table stale after deep analysis | Not fixed |
| 3  | P4 | Horizontal scroll on mobile | Not fixed |
| 10 | P4 | AI coach markdown not rendered | Not fixed |
| 12 | P4 | Radar scan not returning "scan already running" | Not fixed |
| 4  | Enh | Neutral evidence card is yellow not gray | Not fixed |
| 15 | Enh | Kalshi should use API key not email/password | Not fixed |
| 20 | Enh | No popup/modal when scan completes | Not fixed |
| 22 | Enh | White screen on page refresh | Not fixed |

---

## ⚠️ CRITICAL NOTE — Bug #11 is a Blocker

Bug #11 (NULL edge, AI probability, market price in recommendations) is
blocking Phase 2 tests 4.9 and 4.10 (live trading execution). Fix this
before any live trading tests are attempted.

**Fix order for P1 bugs: #11 → #8 → #14 → #7/#6 together**

---

## Fix Group A — P1 Critical Bugs (fix these first)

---

### Bug #11 — Missing Edge, AI Probability, Market Price in Recommendations (NULL)

**Severity:** P1 — BLOCKER for live trading tests 4.9 and 4.10
**Affected file:** `artifacts/api-server/src/services/recommendations.ts`

**Root cause:** When the AI recommendations scan generates recommendation
objects, it is not mapping the edge, aiProbability, and marketPrice fields
from the asset data before saving to the database. These fields are left NULL,
which means the risk gate in the trading engine has no edge value to check —
blocking all trade execution.

**Prompt for Replit AI:**

```
In artifacts/api-server/src/services/recommendations.ts, find where
recommendation objects are constructed and inserted into the database.

The fields edge, aiProbability, and marketPrice are currently NULL in
the database after a scan runs. Fix this by:

1. When building each recommendation object, look up the corresponding
   asset from the assets list that was fetched at the start of the scan.
   Match by asset id or name.

2. Map these fields from the matched asset onto the recommendation
   before saving:
   - edge: from asset.edge (or alphaScore)
   - aiProbability: from asset.aiProbability
   - marketPrice: from asset.marketProbability or asset.currentPrice

3. If an asset match is not found, default to 0 for numeric fields
   rather than null, so the risk gate can still evaluate the trade.

4. Verify by running POST /api/recommendations/scan, waiting 60 seconds,
   then checking GET /api/recommendations/briefing — the recommendation
   objects in the response should have non-null values for edge,
   aiProbability, and marketPrice.

Run pnpm run typecheck after changes. Zero errors required.
```

---

### Bug #8 — 404 Error on Closing Trade on Frontend

**Severity:** P1
**Affected files:** `artifacts/alpha-lens/src/pages/portfolio.tsx` (or similar)
and `artifacts/api-server/src/routes/portfolio.ts`

**Root cause:** The frontend close trade button is calling the wrong URL.
The API route is `POST /api/portfolio/close/:id` but the frontend is likely
calling `/api/portfolio/close` without the trade ID, or using the wrong HTTP
method, causing a 404.

**Prompt for Replit AI:**

```
Bug: Clicking the "Close" button on an open trade in the portfolio page
returns a 404 error.

1. In the frontend portfolio page (artifacts/alpha-lens/src/pages/ or
   wherever the portfolio UI is), find the close trade button handler.
   Verify it is calling: POST /api/portfolio/close/{tradeId}
   where tradeId is the actual ID of the trade being closed.
   Fix the URL if it is missing the ID or using the wrong path.

2. In artifacts/api-server/src/routes/portfolio.ts, verify the route
   is defined as: POST /close/:id (which maps to /api/portfolio/close/:id)
   and that it reads req.params.id correctly.

3. Test by:
   a. Opening a paper trade via POST /api/portfolio/trade
   b. Getting the trade ID from GET /api/portfolio
   c. Closing via POST /api/portfolio/close/{id} in Postman — must return 200
   d. Confirming the frontend close button works end to end

Run pnpm run typecheck after changes. Zero errors required.
```

---

### Bug #14 — pctChange is Null in Radar Prices

**Severity:** P1
**Affected file:** `artifacts/api-server/src/services/market-radar.ts`

**Root cause:** The radar price monitor is not calculating the percentage
change between the current price and the previous price in the history.
It fetches prices but does not compare them to populate pctChange.

**Prompt for Replit AI:**

```
In artifacts/api-server/src/services/market-radar.ts, find the function
that builds the price monitor response (used by GET /api/radar/prices).

The pctChange field is null for all assets. Fix this by:

1. When building each price entry for the response, calculate pctChange
   by comparing the current price to the oldest price in that asset's
   price history within the monitoring window.

   Formula: pctChange = ((currentPrice - oldestPrice) / oldestPrice) * 100
   Round to 2 decimal places.

2. If there is only one price point in history (no comparison possible),
   set pctChange to 0 rather than null.

3. Update the price entry object to include the calculated pctChange
   before returning it in the API response.

4. Verify with GET /api/radar/prices — pctChange should be a number
   (positive, negative, or zero) not null for all assets.

Run pnpm run typecheck after changes. Zero errors required.
```

---

### Bugs #7 and #6 — BTC/ETH/SOL Prices Stale + CoinGecko 429 Rate Limit

**Severity:** P1 (#7) and P2 (#6) — fix together, same root cause
**Affected file:** `artifacts/api-server/src/services/market-data.ts`

**Root cause:** CoinGecko's free tier rate limits to ~30 requests/minute.
The 5-minute market refresh cron job is hitting this limit, causing 429
errors and leaving crypto prices stale. The fix requires adding retry
logic with exponential backoff and caching the last successful price so
stale data is shown with a warning rather than null.

**Prompt for Replit AI:**

```
In artifacts/api-server/src/services/market-data.ts, fix the CoinGecko
price fetching to handle rate limits gracefully:

1. Add retry logic to the CoinGecko fetch with exponential backoff:
   - On a 429 response, wait 10 seconds then retry once
   - On a second 429, log a warning and use the last cached price
   - Do not crash or return null on rate limit errors

2. Cache the last successful CoinGecko response in memory (a module-level
   variable is fine). When a 429 occurs and retry fails, use this cached
   value with the original timestamp so the data is marked as stale.

3. Add a field to crypto asset responses indicating when the price was
   last successfully fetched: lastSuccessfulFetch timestamp.

4. Add a console warning when falling back to cached prices:
   "CoinGecko rate limited — using cached prices from [timestamp]"

5. Do NOT increase the refresh frequency — keep the 5-minute cron.
   The fix is resilience on failure, not more frequent calls.

Verify by running the market refresh 3 times quickly via
POST /api/markets/refresh and checking the logs — no crash, graceful
fallback with warning log.

Run pnpm run typecheck after changes. Zero errors required.
```

---

## Fix Group B — P2 High Bugs

---

### Bug #23 — Most Fields in Radar Alerts Are Null

**Severity:** P2
**Affected file:** `artifacts/api-server/src/services/market-radar.ts`

**Root cause:** When radar alerts are created and stored, many fields are
not being populated from the available data before the insert.

**Prompt for Replit AI:**

```
In artifacts/api-server/src/services/market-radar.ts, find where radar
alert objects are constructed before being inserted into the radar_alerts
table.

Many fields are null in the stored alerts. Review each alert type and
ensure these fields are populated when data is available:

For price_spike alerts:
- pctChange: the calculated percentage change that triggered the spike
- direction: "up" if pctChange > 0, "down" if pctChange < 0
- priceStart: the oldest price in the comparison window
- priceNow: the current price
- windowMinutes: the threshold window from SPIKE_THRESHOLDS
- thresholdPct: the threshold percentage from SPIKE_THRESHOLDS
- dataSource: "Yahoo Finance / CoinGecko" depending on asset type
- historicalNote: from the getHistoricalContext function
- chainAssets: array of downstream asset IDs from CHAIN_REACTIONS

For chain_reaction alerts:
- confidence: from the chain reaction definition
- reason: from the chain reaction definition
- triggerAsset: the asset ID that triggered the chain
- triggerPct: the pct change of the trigger asset
- direction: "bull" or "bear" from the chain reaction definition

For volume_anomaly alerts:
- volumeMultiplier: the calculated ratio vs 30-day average
- volumeType: "equity_volume" or "options_flow"
- note: description of the anomaly

After fixing, run POST /api/radar/scan, wait for completion, then
GET /api/radar/alerts and verify fields are populated.

Run pnpm run typecheck. Zero errors required.
```

---

## Fix Group C — P3 Medium Bugs (fix in this order)

---

### Bugs #16, #17, #18 — Missing Concurrent Operation Locks (fix all three together)

**Severity:** P3 — same pattern, same fix approach
**Affected files:**
- `artifacts/api-server/src/services/market-data.ts` (#16)
- `artifacts/api-server/src/services/market-radar.ts` (#17)
- `artifacts/api-server/src/services/recommendations.ts` (#18)

**Root cause:** All three scan/refresh operations lack idempotency locks.
When triggered simultaneously (manually via Postman while the cron is also
running), two instances run in parallel causing race conditions. Each service
needs an `isRunning` boolean flag that prevents concurrent execution.

**Prompt for Replit AI:**

```
Three services are missing concurrent operation locks. Fix all three:

1. In artifacts/api-server/src/services/market-data.ts:
   - Add a module-level boolean: let isRefreshing = false;
   - At the start of the refresh function, check: if (isRefreshing) {
       console.log("Market refresh already in progress, skipping");
       return { skipped: true };
     }
   - Set isRefreshing = true in a try block, then finally: isRefreshing = false;
   - The POST /api/markets/refresh route should return:
     { status: "already_running", message: "Market refresh already in progress" }
     when skipped.

2. In artifacts/api-server/src/services/market-radar.ts:
   - Add: let isRadarScanning = false;
   - Same pattern: check → set true → try/finally reset to false
   - POST /api/radar/scan should return:
     { status: "scan_already_running", message: "A radar scan is already in progress..." }
     when skipped.

3. In artifacts/api-server/src/services/recommendations.ts:
   - Add: let isScanning = false;
   - Same pattern
   - POST /api/recommendations/scan should return:
     { status: "scan_already_running", message: "Recommendations scan already in progress, skipping" }
     when skipped.

Verify by hitting each endpoint twice rapidly in Postman — the second
request must return the "already_running" status, not "started".

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #9 — Coach Recommendations Empty, riskAssessment Null

**Severity:** P3
**Affected file:** `artifacts/api-server/src/services/coach.ts`

**Root cause:** The coach response parser is not extracting bullet points
into the recommendations array, and riskAssessment is not being parsed
from the AI response text.

**Prompt for Replit AI:**

```
In artifacts/api-server/src/services/coach.ts, fix the response parsing:

1. The recommendations array is returning empty [].
   Find the parsing logic that extracts bullet points from the AI response.
   It should parse lines starting with: -, •, *, or numbered (1. 2. 3.)
   Strip the prefix character and trim whitespace before adding to array.
   Cap at 5 items maximum.
   If no bullet points found, extract the last 1-2 sentences as recommendations.

2. The riskAssessment field is null.
   After getting the full AI analysis text, search for a section that
   discusses risk — look for keywords: "risk", "caution", "warning",
   "downside", "consider". Extract that sentence or paragraph.
   If no risk language found, set riskAssessment to:
   "Standard market risks apply. Always size positions appropriately."
   Never return null.

3. Verify with POST /api/coach/analyze body:
   { "question": "Should I buy Bitcoin right now?", "assetId": 1 }
   Response must have non-empty recommendations array and non-null
   riskAssessment string.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #13 — byType Missing volume_anomaly in Radar History

**Severity:** P3
**Affected file:** `artifacts/api-server/src/routes/radar.ts`

**Root cause:** The byType summary in GET /api/radar/history only counts
some alert types, missing the volume_anomaly type from the aggregation.

**Prompt for Replit AI:**

```
In artifacts/api-server/src/routes/radar.ts, find the GET /history
endpoint that returns byType and bySeverity summary objects.

The byType object is missing the volume_anomaly key even when
volume anomaly alerts exist in the database.

Fix the aggregation logic to count ALL alert types dynamically:
  const byType: Record<string, number> = {};
  for (const alert of alerts) {
    byType[alert.type] = (byType[alert.type] || 0) + 1;
  }

This ensures any alert type present in the data appears in byType,
including volume_anomaly, chain_reaction, price_spike, and any future types.

Apply the same dynamic approach to bySeverity.

Verify with GET /api/radar/history after a scan that has produced
volume anomaly alerts — byType must include volume_anomaly key.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #2 — Incorrect Edge Badge Color

**Severity:** P3
**Affected file:** Frontend component that renders the market scanner table

**Root cause:** The edge badge coloring logic has an incorrect threshold
check. An edge of +4.0 is showing no color (gray) when it should be green.
The threshold for "near-zero" gray is likely set too high (e.g., |edge| < 5)
when it should be a tighter range (|edge| < 1 or < 0.5).

**Prompt for Replit AI:**

```
In the frontend scanner/markets table component (check
artifacts/alpha-lens/src/pages/ and artifacts/alpha-lens/src/components/
for the market list or scanner component), find the edge badge color logic.

Fix the coloring thresholds:
- Green badge: edge > 0 (any positive edge, including +4.0)
- Red badge: edge < 0 (any negative edge)
- Gray badge: edge === 0 or edge is null/undefined

The current logic incorrectly treats small positive values as near-zero.
Change it to: edge > 0 ? green : edge < 0 ? red : gray

Do not use a threshold range — any non-zero positive is green,
any non-zero negative is red. Only exactly zero or null is gray.

Verify on the homepage that +4.0 shows green badge, -2.5 shows red,
and 0 or null shows gray.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #5 — Signal Cards Not Expandable

**Severity:** P3
**Affected file:** Frontend asset/market detail page

**Root cause:** Signal descriptions are truncated with CSS ellipsis but
there is no expand mechanism. Users cannot read the full signal text.

**Prompt for Replit AI:**

```
In the asset detail page (artifacts/alpha-lens/src/pages/market-detail
or similar), find the signal card component that displays evidence signals.

Signal text is currently truncated with ellipsis. Add expand/collapse
functionality:

1. Add a local state boolean per signal card: isExpanded (default false)
2. When isExpanded is false: show truncated text (2-3 lines max)
   and show a "Show more" button or clickable "..."
3. When isExpanded is true: show full signal text and a "Show less" button
4. Clicking the card or the button toggles isExpanded
5. Style: expanded state removes the line-clamp CSS class

This is a frontend-only change. No API changes needed.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #19 — No Manual Add/Remove in Watchlist

**Severity:** P3
**Affected file:** `artifacts/alpha-lens/src/pages/briefing.tsx` and/or
watchlist component

**Root cause:** The watchlist only allows the AI to add items.
Users cannot manually add assets from the scanner or remove items
from the watchlist page.

**Prompt for Replit AI:**

```
Add manual watchlist management to the /briefing page:

1. On the /briefing watchlist section, add a "Remove" button next to
   each watchlist item. On click, call:
   DELETE /api/recommendations/watchlist/{id}
   Then refresh the watchlist display.

2. On the market scanner (homepage), add a watchlist icon/button
   next to each asset row. On click, call:
   POST /api/recommendations/watchlist
   Body: { assetId: asset.id, assetTitle: asset.name, assetClass: asset.sector }
   Show a success state (icon fills in) after adding.

3. Handle the case where an asset is already on the watchlist —
   check the current watchlist before showing the add button,
   and show a filled/active state if already added.

This is primarily a frontend change. The API endpoints already exist.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #21 — Missing Chain Map Visualization on /radar

**Severity:** P3
**Affected file:** `artifacts/alpha-lens/src/pages/radar.tsx`

**Root cause:** The /radar page has no visual representation of
chain reaction maps. The API endpoint GET /api/radar/chains exists
and returns data, but the frontend does not render it.

**Prompt for Replit AI:**

```
In artifacts/alpha-lens/src/pages/radar.tsx, add a Chain Reactions
section that displays the cross-asset chain reaction maps.

1. Add a new tab or section called "Chain Reactions" on the /radar page.

2. Fetch data from GET /api/radar/chains on page load.

3. For each trigger asset in the chain map, display:
   - The trigger asset name as a section header
   - A list of downstream assets showing:
     * Asset name
     * Direction (bull/bear) with green/red color
     * Confidence percentage
     * Reason text

4. Layout: use a simple card-based layout. Each trigger asset gets
   its own card. Downstream assets are listed inside with colored
   directional indicators (↑ green for bull, ↓ red for bear).

5. Add a brief explanation at the top:
   "When a trigger asset moves significantly, these downstream assets
   are historically affected."

This is a frontend-only change. The API already returns the data.

Run pnpm run typecheck. Zero errors required.
```

---

## Fix Group D — P4 Low Bugs

---

### Bug #1 — Homepage Table Stale After Deep Analysis

**Severity:** P4
**Root cause:** React Query cache is not invalidated when the AI scoring
completes. The homepage table uses cached data and does not re-fetch
after a score is triggered on the detail page.

**Prompt for Replit AI:**

```
In the asset detail page, after POST /api/markets/:id/score completes
successfully, invalidate the React Query cache for the markets list.

Using TanStack Query v5:
  const queryClient = useQueryClient()
  // After score mutation succeeds:
  queryClient.invalidateQueries({ queryKey: ['markets'] })

This forces the homepage scanner to re-fetch fresh data when the user
navigates back, showing the updated AI scores without a manual refresh.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #3 — Horizontal Scroll on Mobile

**Severity:** P4
**Root cause:** Some component has a fixed width or min-width wider than
the mobile viewport, causing overflow.

**Prompt for Replit AI:**

```
Fix horizontal scroll on mobile across all pages in
artifacts/alpha-lens/src/.

1. In the main layout or app wrapper, add to CSS:
   html, body { overflow-x: hidden; max-width: 100vw; }

2. Find any table or grid component with fixed pixel widths that exceed
   mobile viewport (typically anything over 360px fixed width).
   Replace fixed widths with responsive alternatives:
   - Tables: add overflow-x: auto to a wrapper div, not the table itself
   - Grids: use grid-template-columns: repeat(auto-fit, minmax(0, 1fr))
   - Text: ensure no text has white-space: nowrap without overflow handling

3. Test on Chrome DevTools mobile viewport (375px width) — no horizontal
   scrollbar should appear on any page.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #10 — AI Coach Markdown Not Rendered

**Severity:** P4
**Root cause:** The coach response text contains markdown (asterisks, etc.)
that is displayed as raw text instead of being rendered as HTML.

**Prompt for Replit AI:**

```
In the AI Coach page or component (artifacts/alpha-lens/src/pages/coach.tsx
or the coach response component), the AI response is displayed as raw text
including markdown symbols like ** and *.

Fix by rendering markdown properly:

1. Install the react-markdown package:
   pnpm add react-markdown --filter @workspace/alpha-lens

2. Replace the raw text display with:
   import ReactMarkdown from 'react-markdown'
   <ReactMarkdown>{coachResponse.analysis}</ReactMarkdown>

3. Add basic prose styling so the rendered markdown looks clean —
   headings have appropriate size, bold text is bold, bullet lists
   have proper spacing.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #12 — Radar Scan Not Returning "Scan Already Running"

**Note:** This is resolved by the lock fix in Bug #17 above (Fix Group C,
Bugs #16/17/18). Verify it is fixed after applying those locks.
No separate fix needed.

---

## Fix Group E — Enhancements

These are improvements, not bugs. Apply after all P1–P4 bugs are fixed.

---

### Enhancement #4 — Neutral Evidence Card Should Be Gray Not Yellow

```
In the evidence signal card component, find the color applied to
"neutral" direction signals. Change the background/border color
from yellow/amber to gray.
Neutral = direction is "neutral" or null.
Gray style: background #F1EFE8, border #B4B2A9, text #5F5E5A.
```

---

### Enhancement #15 — Kalshi API Key Instead of Email/Password

```
Note: This is a security enhancement for future implementation.
The current Kalshi integration uses KALSHI_EMAIL and KALSHI_PASSWORD
for authentication. When Kalshi releases API key-based auth (expected
in their developer roadmap), update platform-router.ts to use
KALSHI_API_KEY instead. For now, document this as a known improvement
in a TODO comment in platform-router.ts near the Kalshi auth section:
// TODO: Migrate to API key auth when Kalshi developer program supports it
```

---

### Enhancement #20 — Scan Completion Toast/Modal

```
In the /briefing and /radar pages, after a scan is triggered and
completes, show a toast notification:
"Scan complete — X recommendations generated" (briefing)
"Radar scan complete — X alerts generated" (radar)

Use a simple toast component that auto-dismisses after 3 seconds.
Poll GET /api/recommendations/briefing or GET /api/radar/alerts
after a 60-second delay following scan trigger to detect completion.
```

---

### Enhancement #22 — White Screen on Refresh

```
In artifacts/alpha-lens/vite.config.ts or the router configuration,
ensure the SPA fallback is correctly configured so direct URL access
and page refresh serve index.html rather than a blank page.

If using Wouter for routing, ensure the server (or Vite dev server)
is configured with historyApiFallback: true or equivalent.
For production builds, ensure the hosting platform serves index.html
for all non-asset routes.
```

---

## Fix Completion Checklist

Run these verifications after all fixes are applied:

| # | Verification | Pass/Fail |
|---|--------------|-----------|
| 1 | `pnpm run typecheck` — zero errors | |
| 2 | POST /api/recommendations/scan → GET /api/recommendations/briefing — recommendations have non-null edge, aiProbability, marketPrice | |
| 3 | Open trade, go to portfolio, click Close — no 404 error | |
| 4 | GET /api/radar/prices — pctChange is a number, not null | |
| 5 | POST /api/markets/refresh twice rapidly — second returns "already_running" | |
| 6 | POST /api/radar/scan twice rapidly — second returns "scan_already_running" | |
| 7 | POST /api/recommendations/scan twice rapidly — second returns "scan_already_running" | |
| 8 | BTC price in app matches CoinGecko within reasonable tolerance | |
| 9 | POST /api/coach/analyze — recommendations array not empty, riskAssessment not null | |
| 10 | GET /api/radar/history — byType includes volume_anomaly when applicable | |
| 11 | Edge +4.0 shows green badge on homepage scanner | |
| 12 | Signal cards on asset detail page expand/collapse on click | |
| 13 | GET /api/radar/alerts — alert objects have populated fields, not null | |
| 14 | /radar page shows Chain Reactions section with data | |
| 15 | /coach page renders markdown (bold text is bold, no asterisks visible) | |
| 16 | After deep analysis, returning to homepage shows updated data without manual refresh | |
| 17 | No horizontal scroll on mobile (test at 375px width) | |
| 18 | Live trading tests 4.9 and 4.10 can now be executed (Bug #11 resolved) | |

---

## Priority Order Summary

Fix in this exact sequence to unblock testing fastest:

1. **Bug #11** — NULL fields blocking live trading tests (BLOCKER)
2. **Bug #8** — 404 on close trade
3. **Bug #14** — pctChange null in radar
4. **Bugs #7 + #6** — stale crypto prices + CoinGecko rate limit
5. **Bug #23** — null fields in radar alerts
6. **Bugs #16 + #17 + #18** — concurrent operation locks (all together)
7. **Bug #9** — coach recommendations empty
8. **Bug #13** — byType missing volume_anomaly
9. **Bug #2** — edge badge color
10. **Bug #5** — signals not expandable
11. **Bug #19** — watchlist manual add/remove
12. **Bug #21** — chain map visualization
13. **Bugs #1, #3, #10** — P4 low priority
14. **Enhancements #4, #15, #20, #22** — after all bugs fixed

---

*Arclion · Internal Bug Fix Document · Confidential · April 2026*
