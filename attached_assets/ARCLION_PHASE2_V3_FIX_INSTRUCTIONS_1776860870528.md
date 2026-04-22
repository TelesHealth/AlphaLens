# Arclion — Replit Bug Fix Instructions
## Phase 2 Bug Report V3 · April 2026
**Internal codename:** AlphaLens | **Company:** Arclion

---

## READ THIS FIRST

pnpm workspace monorepo. After every fix:
- Run `pnpm run typecheck` — zero errors required before moving on
- Apply one fix group at a time — never paste all fixes at once
- Verify with Postman before marking any bug done

Fix order: **#39 → #40 → #7 → #41 → #38 → #16 → #2 → #10 → #35 → #23 → #3 → Enhancements**

---

## Bug Summary

| # | Sev | Title | Status |
|---|-----|-------|--------|
| 39 | **P1** | Balance precision mismatch (DB vs frontend) | Not fixed |
| 7  | **P1** | BTC/ETH/SOL stale on repeated refresh | Monitoring |
| 40 | P2 | Daily trade limit bypass via approval queue | Not fixed |
| 41 | P2 | Position fields null (price, size, orderId) | Not fixed |
| 38 | P2 | AI confidence below 0.75 standard | Not fixed |
| 6  | P2 | CoinGecko 429 | Monitoring |
| 16 | P3 | Market refresh lock in wrong place (routes not service) | Not fixed |
| 23 | P3 | Alert fields null | Monitoring |
| 2  | P3 | Edge badge color | Not fixed |
| 35 | P4 | Logo image still says Alpha Lens | Not fixed |
| 10 | P4 | Universal markdown — all AI responses | Not fixed |
| 22 | Enh | White screen on refresh | Not fixed |
| 37 | Enh | Watchlist toggle | Not fixed |
| 3* | P2 | Radar scan count zero (Phase 1 V2) | Not fixed |

---

## Fix Group A — P1 Critical

---

### Bug #39 — Incorrect Balance Precision (P1)

**Root cause:** The database stores balance with full float precision
(e.g. $0.0059) but the frontend rounds up and displays $0.01.
When a user tries to trade $0.01 their actual balance is $0.0059
so the trade fails with "Insufficient balance." This is a real
user-facing financial accuracy problem even in paper trading.

**Affected files:**
- `artifacts/api-server/src/routes/portfolio.ts` or
  `artifacts/api-server/src/services/portfolio.ts`
- `artifacts/alpha-lens/src/pages/portfolio.tsx`

```
In the portfolio service and routes, fix balance precision
in two places:

1. API response — when returning balance in GET /api/portfolio
   and GET /api/portfolio/stats, floor the balance to 2 decimal
   places (not round — floor):

   const displayBalance = Math.floor(balance * 100) / 100;

   This ensures the displayed balance never exceeds what the
   user can actually spend. $0.0059 becomes $0.00, not $0.01.

2. Trade validation — in POST /api/portfolio/trade, when checking
   if the user has sufficient balance, compare the raw database
   balance (not the rounded display value) against the trade amount:

   if (portfolio.balance < amount) {
     return { error: "Insufficient balance" };
   }

   Do NOT use the rounded display balance for this check —
   always use the raw value from the database.

3. Frontend display — in artifacts/alpha-lens/src/pages/portfolio.tsx,
   ensure balance is displayed using the formatCurrency helper
   which already handles 2 decimal places. Do not add additional
   rounding on top of what the API returns.

Run pnpm run typecheck. Zero errors required.

Verify: GET /api/portfolio — balance field should show $0.00
when DB value is $0.0059. POST /api/portfolio/trade with amount
$0.01 should return "Insufficient balance" since actual balance
is $0.0059 which floors to $0.00.
```

---

### Bug #7 — BTC/ETH/SOL Stale on Repeated Refresh (P1)

**Updated context from Charlize:** Prices show correctly on
first refresh, but if the user refreshes again immediately,
the cached version shows instead of a fresh fetch. The 30s
TTL cache is returning cached data even on user-triggered
manual refreshes, not just scheduled refreshes.

**Affected file:** `artifacts/api-server/src/services/market-data.ts`

```
In artifacts/api-server/src/services/market-data.ts, the
CoinGecko 30s TTL cache needs to distinguish between two
types of refresh:

1. Scheduled auto-refresh (every 5 min cron) — use the cache
   as a rate-limit guard. If the last fetch was < 30s ago,
   skip and use cached data.

2. Manual user-triggered refresh (POST /api/markets/refresh) —
   bypass the cache entirely and always fetch fresh data from
   CoinGecko, regardless of when the last fetch was.

Fix by adding a bypassCache parameter to the fetch function:

async function fetchCoinGeckoPrices(bypassCache = false) {
  if (!bypassCache && cache && Date.now() - cacheTime < 30000) {
    console.warn("CoinGecko: using cached prices (rate limited)");
    return cache;
  }
  // fetch fresh data...
  cache = freshData;
  cacheTime = Date.now();
  return cache;
}

In the route handler for POST /api/markets/refresh, call
fetchCoinGeckoPrices(true) to bypass the cache.

In the scheduled cron job, call fetchCoinGeckoPrices(false)
to respect the rate limit guard.

Run pnpm run typecheck. Zero errors required.

Verify: POST /api/markets/refresh twice in rapid succession —
both calls should return fresh CoinGecko prices, not cached.
Console should show "CoinGecko: fresh prices fetched" both times.
```

---

## Fix Group B — P2 High Priority

---

### Bug #40 — Daily Trade Limit Bypass via Approval Queue (P2)

**Root cause:** The daily trade count check only runs at
execution time, not at approval time. A user can queue 15
pending approvals even though the limit is 10, then approve
them all. The guard needs to be at both stages.

**Affected file:** `artifacts/api-server/src/services/trading.ts`

```
The daily trade limit (MAX_DAILY_TRADES, default 10) currently
only blocks execution. Fix it to also block approval.

1. In POST /api/trading/pending/:id/approve, before approving
   an order, call getDailyTradeCount() and check against
   MAX_DAILY_TRADES:

   const dailyCount = await getDailyTradeCount();
   const maxTrades = parseInt(process.env.MAX_DAILY_TRADES ?? "10");

   if (dailyCount >= maxTrades) {
     return res.status(400).json({
       error: `Daily trade limit (${maxTrades}) reached — approval blocked`
     });
   }

2. In POST /api/trading/execute, also check before queuing
   a new pending order — do not allow more pending orders
   than the daily trade limit allows:

   const pendingCount = await getPendingOrderCount();
   const dailyCount = await getDailyTradeCount();

   if (dailyCount + pendingCount >= maxTrades) {
     return res.status(400).json({
       error: `Daily trade limit (${maxTrades}) would be exceeded`
     });
   }

3. Implement getPendingOrderCount() if it does not exist:
   Query pending_orders table for orders with
   status: "pending_approval" created today (UTC midnight).

Run pnpm run typecheck. Zero errors required.

Verify (RG11 from testing plan): Execute 11 trades in the
same calendar day — the 11th should be blocked at both
execute AND approve with:
"Daily trade limit (10) reached"
```

---

### Bug #41 — Position Fields Null (price, size, orderId) (P2)

**Affected file:** `artifacts/api-server/src/services/trading.ts`
and/or `artifacts/api-server/src/routes/trading.ts`

```
In GET /api/trading/positions, the response returns positions
with null values for price, size, and orderId.

Fix by populating these fields when creating live trade records:

1. price — use the current asset price at time of execution.
   Fetch from the assets table: asset.currentPrice.
   Store as liveTrade.price = asset.currentPrice.

2. size — calculate from amountUsd and price:
   size = amountUsd / price (number of units purchased).
   Store as liveTrade.size = size.

3. orderId — generate a unique order ID at execution time
   if one is not returned by the trading platform:
   orderId = `ORDER-${Date.now()}-${recommendationId}`
   Store as liveTrade.orderId = orderId.

Also verify GET /api/trading/positions only returns trades
with status: "filled" as per the API spec.

Run pnpm run typecheck. Zero errors required.

Verify: GET /api/trading/positions — all position objects
should have non-null price, size, and orderId fields.
```

---

### Bug #38 — AI Confidence Below 0.75 Standard (P2)

**Context:** Per test LC05 in the testing plan, the AI Coach
should return confidence: 0.75 on a successful response.
Charlize is seeing values below 0.75.

**Affected file:** `artifacts/api-server/src/services/coach.ts`

```
In artifacts/api-server/src/services/coach.ts, find where
the confidence field is set in the coach response.

The spec (LC05) requires confidence: 0.75 on all successful
AI responses. This is a fixed value, not a computed one —
it represents the system's confidence in the AI connection,
not the AI's confidence in its answer.

Fix:
1. Find the confidence field assignment in the coach service.
2. Ensure it is set to exactly 0.75 on every successful
   Claude API response.
3. Ensure the fallback path sets confidence: 0.3
   (per LC09 in the testing plan).
4. Confirm no code path between success and response
   is overwriting the 0.75 value with a computed number.

Run pnpm run typecheck. Zero errors required.

Verify: POST /api/coach/analyze with any question —
response.confidence should equal exactly 0.75.
POST with Anthropic proxy blocked —
response.confidence should equal 0.3.
```

---

## Fix Group C — P3 Medium Priority

---

### Bug #16 — Market Refresh Lock in Wrong Place (P3)

**Charlize's diagnostic note:** "Put the lock inside the
service function, not in the routes."

**Affected files:**
- `artifacts/api-server/src/services/market-data.ts`
- `artifacts/api-server/src/routes/markets.ts`

```
The isRefreshing lock for POST /api/markets/refresh is
currently in the route handler. Move it into the service
function so it works regardless of how the refresh is
triggered (manual API call, scheduled cron, or internal call).

1. In artifacts/api-server/src/services/market-data.ts:
   Add the lock at the top of the refreshAllMarkets() function:

   let isRefreshing = false;

   export async function refreshAllMarkets() {
     if (isRefreshing) {
       console.log("Market refresh already in progress, skipping");
       return { skipped: true };
     }
     isRefreshing = true;
     try {
       // existing refresh logic
     } finally {
       isRefreshing = false;
     }
   }

2. In artifacts/api-server/src/routes/markets.ts:
   Remove the lock check from the route handler — the service
   function now handles it. The route just calls the service
   and returns the result.

3. Apply the same pattern to the radar scan lock in
   artifacts/api-server/src/services/market-radar.ts —
   move isRadarScanning into the service function if it
   is currently in the route.

Run pnpm run typecheck. Zero errors required.

Verify: POST /api/markets/refresh twice simultaneously —
second call should return {"skipped": true} or
{"status": "refresh_already_running"}.
```

---

### Bug #2 — Edge Badge Color (P3)

**Persistent issue.** Has survived multiple fix attempts.
Charlize reports edge of +4.0 shows no color badge.

**Affected files:**
- `artifacts/alpha-lens/src/components/ui-helpers.tsx`
- `artifacts/alpha-lens/src/pages/scanner.tsx`

```
In artifacts/alpha-lens/src/components/ui-helpers.tsx,
find the ScoreDisplay component or wherever edge badge
color is determined.

The rule should be:
- edge > 0: green badge
- edge < 0: red badge
- edge === 0 or edge === null: gray badge

Common causes of this bug:
1. The check uses >= 0 instead of > 0, so zero shows green
   (not a problem) but positive values near zero may not
   trigger due to floating point.
2. The badge color class is being overridden by Tailwind
   purge — check that the color classes are not being
   dynamically constructed (e.g. `bg-${color}`) which
   Tailwind cannot detect at build time.
3. The edge value arriving at the component is a string
   "4.0" not a number 4.0 — add explicit type coercion:
   const edgeNum = Number(edge);

Fix:
const edgeNum = Number(edge ?? 0);
const badgeColor = edgeNum > 0
  ? "bg-green-500/10 text-green-400 border-green-500/20"
  : edgeNum < 0
  ? "bg-red-500/10 text-red-400 border-red-500/20"
  : "bg-muted text-muted-foreground border-border";

Use hardcoded Tailwind class strings — never construct
class names dynamically from variables.

Run pnpm run typecheck. Zero errors required.

Verify on frontend: An asset with edge +4.0 should show
a green badge. An asset with edge -3.2 should show red.
An asset with edge 0 should show gray.
```

---

### Bug #23 — Alert Fields Null (P3 — Monitoring)

**Status:** Bug #23 fix was applied previously and confirmed
partially working. Charlize is still monitoring. If still
showing null after the previous fix, apply this:

```
In artifacts/api-server/src/services/market-radar.ts,
find where volume_anomaly alerts are built.

Confirm these fields are populated for each alert type:

price_spike: pctChange, direction, priceStart, priceNow,
  windowMinutes, thresholdPct, dataSource, historicalNote,
  chainAssets

chain_reaction: confidence, reason, triggerAsset,
  triggerPct, direction

volume_anomaly (equity): volumeMultiplier, volumeType,
  note

Note: Unusual Whales alerts (dark pool / options flow)
intentionally only populate: note, dataSource, volumeType,
direction. This is correct behavior — do not try to add
pctChange or priceNow to UW alerts.

Run pnpm run typecheck. Zero errors required.
```

---

## Fix Group D — P4 and Branding

---

### Bug #35 — Logo Image File Still Says Alpha Lens (P4)

**Charlize's note:** "Check the logo image beside the Arclion
title in the sidebar. The image still has Alpha Lens."

This is the actual PNG image file, not text. The sidebar text
was updated to ARCLION but the image graphic (`logo-mark.png`)
still contains the old Alpha Lens branding.

**Two options — choose one:**

**Option A (recommended — no image editing):**
```
In artifacts/alpha-lens/src/components/layout.tsx,
remove the logo image entirely from the sidebar header.
Replace the <img> element with a styled text/icon mark.

Replace:
  <img src="...logo-mark.png" alt="Arclion Logo" ... />

With a simple styled letter mark:
  <div className="w-10 h-10 rounded-xl bg-primary/20
    border border-primary/30 flex items-center
    justify-content-center font-bold text-primary text-lg">
    A
  </div>

This gives Arclion a clean letter mark sidebar icon without
needing a new image asset. The full name "ARCLION" text
is already showing next to it.

Run pnpm run typecheck. Zero errors required.
```

**Option B (if a new logo image is available):**
```
Replace the file at:
artifacts/alpha-lens/public/images/logo-mark.png

With a new PNG that shows the Arclion brand.
The image is displayed at w-6 h-6 (24x24px) in the sidebar.
A 64x64 or 128x128 PNG works well at this size.
```

---

### Bug #10 — Universal Markdown for All AI Responses (P4)

**Charlize's updated note:** "ENSURE THAT ALL AI RESPONSES'
MARKDOWN ARE FORMATTED PROPERLY AND COMPLETELY.
IMPLEMENT UNIVERSAL."

This means markdown rendering needs to be applied everywhere
Claude returns text — not just the briefing page.

```
Apply react-markdown rendering universally across all pages
that display AI-generated text.

Pages and components to update:

1. artifacts/alpha-lens/src/pages/briefing.tsx
   Already partially fixed. Confirm headline, why array
   items, historicalContext, and bearCase all use
   <ReactMarkdown> not plain <p> or <span>.

2. artifacts/alpha-lens/src/pages/coach.tsx
   The coach response analysis field — wrap in ReactMarkdown.
   The recommendations array items — wrap each in ReactMarkdown.

3. artifacts/alpha-lens/src/pages/scanner.tsx
   The aiSummary field on market cards — wrap in ReactMarkdown.

4. artifacts/alpha-lens/src/pages/market-detail.tsx
   The aiSummary field on the detail page — wrap in ReactMarkdown.

5. artifacts/alpha-lens/src/pages/radar.tsx
   Any AI-generated alert notes or scan summaries —
   wrap in ReactMarkdown.

Pattern to use everywhere:
  import ReactMarkdown from 'react-markdown'
  <ReactMarkdown className="prose prose-sm prose-invert
    max-w-none">{text ?? ''}</ReactMarkdown>

Run pnpm run typecheck. Zero errors required.

Verify: Ask the AI Coach a question — response should render
with formatted text (bold, bullet points, headers) not raw
asterisks and symbols.
```

---

## Fix Group E — Phase 1 V2 Carry-Over

---

### Bug #3 (Phase 1 V2) — Radar Scan Count Zero (P2)

**This bug has been open since Phase 1 V2. Apply now.**

```
In the radar scan service, the scan count (number of alerts
generated per scan) is returning zero even when alerts exist.

In artifacts/api-server/src/services/market-radar.ts,
find where the scan result is returned after each scan.

The count field should reflect the actual number of alerts
inserted during the scan, not a hardcoded 0.

Fix:
1. Track the number of alerts inserted during each scan
   using a counter variable:
   let alertsGenerated = 0;

2. Increment the counter each time an alert is successfully
   inserted into the database:
   alertsGenerated++;

3. Return the counter in the scan result:
   return { count: alertsGenerated, status: "complete" };

4. Ensure the scheduler logs the correct count:
   console.log(`E8: Radar scan complete`, { count: alertsGenerated });

Run pnpm run typecheck. Zero errors required.

Verify: POST /api/radar/scan, wait 30s, then check server
console — should show "E8: Radar scan complete" with
count > 0 when market conditions trigger alerts.
Also: GET /api/radar/alerts should return alerts
matching the logged count.
```

---

## Verification Checklist

Run all of these after all fixes are applied:

| # | Test | Pass Criterion |
|---|------|----------------|
| 1 | `pnpm run typecheck` | Zero errors |
| 2 | GET /api/portfolio | balance floors to 2 decimal places |
| 3 | POST /api/portfolio/trade with amount > floor(balance) | "Insufficient balance" |
| 4 | POST /api/markets/refresh twice fast | Second returns skipped/already_running |
| 5 | POST /api/markets/refresh (manual) | Console shows fresh CoinGecko prices both times |
| 6 | Execute 11 trades in one day | 11th blocked at execute AND approve |
| 7 | GET /api/trading/positions | price, size, orderId all non-null |
| 8 | POST /api/coach/analyze | confidence === 0.75 |
| 9 | GET /api/radar/alerts | Alert fields populated (not null) |
| 10 | Frontend: edge +4.0 on any asset | Green badge visible |
| 11 | Frontend: AI Coach response | Formatted text, no asterisks |
| 12 | Frontend: Briefing cards | Formatted text, no asterisks |
| 13 | Frontend: Scanner aiSummary | Formatted text, no asterisks |
| 14 | Frontend: Sidebar logo | No Alpha Lens image or text |
| 15 | POST /api/radar/scan (console) | Count > 0 logged |

---

## Priority Order Summary

1. **Bug #39** — Balance precision (P1 — financial accuracy)
2. **Bug #7** — CoinGecko cache on manual refresh (P1)
3. **Bug #40** — Daily trade limit bypass (P2 — risk control)
4. **Bug #41** — Position fields null (P2)
5. **Bug #38** — AI confidence below 0.75 (P2)
6. **Bug #16** — Refresh lock in service not route (P3)
7. **Bug #2** — Edge badge color (P3 — persistent)
8. **Bug #10** — Universal markdown (P4)
9. **Bug #35** — Logo image (P4 — Option A recommended)
10. **Bug #3** — Radar scan count zero (Phase 1 V2)
11. **Enhancements #22, #37** — after all bugs fixed

---

*Arclion · Internal Bug Fix Document · Confidential · April 2026*
