# Arclion — Replit Bug Fix Instructions
## Phase 2 Bug Report V4 · April 2026
**Internal codename:** AlphaLens | **Company:** Arclion

---

## READ THIS FIRST

pnpm workspace monorepo. After every fix group:
- Run `pnpm run typecheck` — zero errors required
- Apply one fix group at a time
- Verify with Postman before marking done

Fix order: **#25/#27 → #28 → #16 → #24a → #24b → #26a/#26b → #29a/#29b → #24c → #7**

---

## Bug Summary

| # | Sev | Title | Status |
|---|-----|-------|--------|
| 25 | **P1** | Users share same portfolio — no user scoping | Not fixed |
| 27 | **P1** | Hardcoded portfolio value | Not fixed |
| 28 | **P1** | BEA missing LineNumber param | Not fixed |
| 7  | **P1** | BTC/ETH/SOL cache stale on repeated refresh | Monitoring |
| 16 | P3 | Market refresh lock persistent (3rd round) | Not fixed |
| 24a | P3 | Sources [] and outcome null in recommendations | Not fixed |
| 24b | P3 | Watchlist delete nonexistent ID returns success | Not fixed |
| 26a | P3 | Direction missing in coach market snapshot | Not fixed |
| 26b | P3 | Coach prompt includes AI summary error | Not fixed |
| 29a | P3 | Flow alerts null fields (issue_type, sector etc.) | Not fixed |
| 29b | P3 | Dark pool null fields (sale_cond_codes, trade_code) | Not fixed |
| 24c | P4 | Minor markdown issues in coach response | Not fixed |

---

## ⚠️ CRITICAL — Bug #25 is the most important fix

Replit flagged this when auth was built:
"Trading data isn't user-scoped yet — portfolio,
trades, pending_orders, live_trades tables don't
have a userId column."

Charlize confirmed it by logging in and seeing
Uncle James's portfolio. Every user currently
shares one global portfolio. This MUST be fixed
before student UAT begins.

---

## Fix Group A — P1 Critical (fix first)

---

### Bugs #25 and #27 — User Portfolio Scoping + Hardcoded Value

**Fix together — same root cause.**

```
CRITICAL: Add user scoping to portfolio and all
trading tables. Every user must have their own
portfolio, trade history, and balance.

This is the issue Replit flagged after auth was
built: "portfolio/trades tables don't have a
userId column."

STEP 1 — Add userId to database schema

In lib/db/src/schema/, update these tables
to add a userId column:

1. portfolio table:
   Add: userId: integer references users(id)
   Make the portfolio unique per userId.
   Each user gets their own portfolio row.

2. trades table (paper trades):
   Add: userId: integer references users(id)

3. live_trades table:
   Already has userId from auth build.
   Verify it is being used correctly.

4. pending_orders table:
   Already has userId from auth build.
   Verify it is being used correctly.

Run: pnpm --filter @workspace/db run push

STEP 2 — Update portfolio service

In artifacts/api-server/src/services/portfolio.ts
or wherever portfolio logic lives:

1. GET /api/portfolio:
   Find portfolio WHERE userId = req.user.userId
   If no portfolio exists for this user,
   CREATE a new one with:
     userId: req.user.userId
     balance: 10000
     initialBalance: 10000
   Return the user's own portfolio only.

2. POST /api/portfolio/trade:
   Find portfolio WHERE userId = req.user.userId
   Insert trade WITH userId = req.user.userId
   Update portfolio WHERE userId = req.user.userId

3. POST /api/portfolio/trade/:id/close:
   Find trade WHERE id = tradeId
     AND userId = req.user.userId
   Only allow closing own trades.

4. GET /api/portfolio/stats:
   Calculate stats from trades WHERE
   userId = req.user.userId only.

STEP 3 — Fix hardcoded portfolio value (Bug #27)

Find any place in the codebase where portfolio
balance or initialBalance is hardcoded as a
number (e.g., 10000 or "10000") in a response
rather than read from the database.

The only place 10000 should appear is as the
DEFAULT value when creating a NEW portfolio
for a new user. All other portfolio value
references must come from the database.

Common locations to check:
- Route handlers returning mock/fallback data
- Service functions with hardcoded fallback values
- Any response that returns balance: 10000 without
  reading from the DB first

Fix all hardcoded instances to read from DB.

STEP 4 — Migrate existing portfolio data

After schema changes, the existing portfolio
rows will have null userId. Update them:

Run this in the Replit shell after schema push:
Assign the existing portfolio row to admin user
(userId = 1, which is Uncle James's account).

UPDATE portfolio SET "userId" = 1
WHERE "userId" IS NULL;

UPDATE trades SET "userId" = 1
WHERE "userId" IS NULL;

This preserves existing test data under the
admin account.

Run pnpm run typecheck. Zero errors required.

Verify:
1. Log in as James — GET /api/portfolio
   Should show James's portfolio with real balance
2. Log in as Charlize — GET /api/portfolio
   Should show a FRESH portfolio with $10,000
   (different from James's portfolio)
3. Charlize opens a paper trade — should appear
   only in Charlize's portfolio, not James's
4. GET /api/portfolio/stats as Charlize
   Should show stats for Charlize's trades only
```

---

### Bug #28 — BEA Missing LineNumber Parameter (P1)

**Root cause:** BEA's NIPA T10101 table returns
multiple line items. Without specifying LineNumber,
the response may return the wrong GDP figure or
an aggregate that doesn't represent GDP growth rate.

```
In artifacts/api-server/src/services/macro-data.ts,
find the fetchGDP() function.

The BEA API call needs a LineNumber parameter to
target the correct GDP data line.

For NIPA Table T10101 (GDP and components),
the correct line for "Gross domestic product"
percent change is LineNumber=1.

Update the BEA API URL to include LineNumber:

https://apps.bea.gov/api/data?
  UserID={BEA_API_KEY}
  &method=GetData
  &DataSetName=NIPA
  &TableName=T10101
  &Frequency=Q
  &Year=LAST5
  &LineNumber=1
  &ResultFormat=JSON

If LAST5 still doesn't work, use explicit years:
  &Year=2024,2025,2026

With LineNumber=1 specified, the response will
return only the top-level GDP growth rate row,
making parsing simpler and more accurate.

Update the parsing logic if needed:
  The filtered search for "Gross domestic product"
  in LineDescription may no longer be necessary
  if LineNumber=1 always returns only that row.
  Simplify to take data[0] and data[1] directly.

Log: "BEA GDP: Q{X} {year} = {value}% growth
     (LineNumber=1 confirmed)"

Run pnpm run typecheck. Zero errors required.

Verify:
GET /api/radar/macro/bea — should return
correct GDP growth rate for most recent quarter.
Console should show the updated log line.
```

---

## Fix Group B — P3 Persistent

---

### Bug #16 — Market Refresh Lock (3rd Round — Persistent)

**This has been flagged in V2, V3, and V4.**
**Charlize's note: lock must be in the service,
not the route.**

```
Bug #16 has been reported three times. Apply this
definitive fix.

In artifacts/api-server/src/services/market-data.ts,
confirm the current state of the isRefreshing lock:

1. The lock variable (isRefreshing) MUST be declared
   at module scope — outside any function — so it
   persists across calls:

   // Module-level lock — persists across requests
   let isRefreshing = false;

2. The refreshAllMarkets() function MUST check and
   set this lock at the very beginning:

   export async function refreshAllMarkets() {
     if (isRefreshing) {
       console.log("Market refresh already in
                   progress, skipping");
       return { skipped: true,
                status: "refresh_already_running" };
     }
     isRefreshing = true;
     try {
       // all refresh logic here
     } finally {
       isRefreshing = false; // always releases
     }
   }

3. In artifacts/api-server/src/routes/markets.ts,
   the route handler must NOT have its own lock
   check. It just calls refreshAllMarkets() and
   returns whatever it returns.

4. If the route is currently calling an internal
   refresh function that bypasses the service-level
   lock, fix it to always go through
   refreshAllMarkets().

Run pnpm run typecheck. Zero errors required.

Verify: POST /api/markets/refresh twice in rapid
succession — second call must return:
{ status: "refresh_already_running",
  message: "A market refresh is already in progress" }
```

---

## Fix Group C — P3 Recommendations + Watchlist

---

### Bug #24a — Sources [] and Outcome Null in Recommendations

```
In the recommendations table and the AI scan
that populates it, two fields are always empty:

1. sources field returns [] (empty array)
   This should contain the data sources that
   informed the recommendation — e.g.:
   ["Unusual Whales", "BLS", "Kalshi", "CoinGecko"]

   In artifacts/api-server/src/services/
   recommendations.ts, when building each
   recommendation object before saving to DB,
   populate the sources array based on what
   data was available in that scan:
   - If Unusual Whales data was used: add "Unusual Whales"
   - If macro context was included: add "BLS", "BEA",
     "NY Fed"
   - Always add the asset's primary price source:
     "CoinGecko" for crypto, "Yahoo Finance" for
     equities, "Kalshi" for prediction markets

2. outcome field returns null
   This is correct for new recommendations —
   outcome is only populated after the event
   resolves (part of the track record system).
   This is NOT a bug — it is expected behavior.
   Close this sub-item as "Not a bug" and
   explain to Charlize that outcome is null
   until the predicted event resolves.

Run pnpm run typecheck. Zero errors required.

Verify: GET /api/recommendations/briefing —
recommendations should have sources array with
at least one entry (not []).
outcome: null is correct and expected.
```

---

### Bug #24b — Watchlist Delete Nonexistent ID Returns Success

```
In artifacts/api-server/src/routes/
recommendations.ts (or wherever the watchlist
DELETE endpoint is handled):

DELETE /api/recommendations/watchlist/:id

Currently returns { status: "removed" } even
when the ID doesn't exist in the database.

Fix by checking if the row exists before deleting:

1. Query the watchlist table for the given id
2. If not found: return 404
   { error: "Watchlist item not found" }
3. If found: delete it and return
   { status: "removed" }

Also add a userId check — users should only
be able to delete their own watchlist items:
WHERE id = :id AND userId = req.user.userId

Run pnpm run typecheck. Zero errors required.

Verify:
DELETE /api/recommendations/watchlist/99999
Should return 404 { error: "Watchlist item
not found" } not { status: "removed" }
```

---

## Fix Group D — P3 Coach Fixes

---

### Bugs #26a and #26b — Coach Market Snapshot Issues

**Fix together — same file.**

```
Two issues in the AI Coach market snapshot
that was added in the recent coach upgrade:

BUG #26a — Direction column missing from
Live Market Snapshot table

In artifacts/api-server/src/services/coach.ts,
find where the market snapshot string is built.

The snapshot table currently shows:
Asset | Price | AI Prob | Market | Edge

Add Direction column:
Asset | Price | AI Prob | Market | Edge | Direction

Update the snapshot string template:
"- [name] ([symbol]): $[price], AI [X]%
  vs market [X]%, edge [+/-X]pts,
  direction: [bullish/bearish/neutral]"

Also ensure the markdown table is properly
formatted with aligned columns if using
a markdown table format.

BUG #26b — Coach prompt includes AI summary error

The market snapshot injects the latest briefing
summary into the coach prompt. If the briefing
summary contains error text or null values,
these appear in the coach response.

Fix:
1. Before injecting the briefing summary, check
   that it is a non-empty string and doesn't
   start with "Error" or contain "undefined"
   or "null".
2. If invalid: omit the briefing summary from
   the context rather than injecting bad data.
3. Add a null guard:
   const safeSummary = briefing?.summary
     && briefing.summary.length > 10
     && !briefing.summary.includes("Error")
     ? briefing.summary.substring(0, 200)
     : null;
   Only inject if safeSummary is not null.

Run pnpm run typecheck. Zero errors required.

Verify:
POST /api/coach/analyze with question:
"What markets look good right now?"
Response should include direction (bullish/
bearish/neutral) for each asset in the snapshot.
Response should not contain any error text.
```

---

## Fix Group E — P3 Unusual Whales Null Fields

---

### Bugs #29a and #29b — Null Fields in Whales Data

**Note from Charlize:**
- Flow alerts null fields: issue_type, sector,
  er_time, marketcap, next_earnings_date
- Dark pool null fields: sale_cond_codes, trade_code
- Also fix flow summary

```
In artifacts/api-server/src/services/
unusual-whales.ts, find where flow alerts
and dark pool data is mapped from the
Unusual Whales API response to the
response objects returned by the endpoints.

BUG #29a — Flow alerts null fields:
  issue_type, sector, er_time, marketcap,
  next_earnings_date

Check the Unusual Whales API response for
flow alerts (/api/option-contracts/flow-alerts)
and map the correct field names:

Common Unusual Whales field name mappings:
  issue_type → alert.issue_type or alert.type
  sector → alert.sector or alert.underlying_sector
  er_time → alert.earnings_time or alert.er_time
  marketcap → alert.marketcap or alert.market_cap
  next_earnings_date → alert.next_earnings_date
    or alert.earnings_date

For any field that Unusual Whales does not
return (truly absent from their API): set to
null explicitly and document which fields are
not provided by UW API.

Apply the same field mapping fix to the
flow summary endpoint.

BUG #29b — Dark pool null fields:
  sale_cond_codes, trade_code

Check the Unusual Whales dark pool API response
and map:
  sale_cond_codes → trade.sale_cond_codes
    or trade.conditions
  trade_code → trade.trade_code or trade.type

For fields not provided by UW API: set null
explicitly.

Important: Do not fabricate data for fields
UW doesn't return. If the field is genuinely
absent from their API, set it to null and
add a comment explaining it's not available
from the source.

Run pnpm run typecheck. Zero errors required.

Verify:
GET /api/whales/flow-alerts — check that
issue_type and sector are populated when
UW returns them.
GET /api/whales/darkpool — check that
sale_cond_codes is populated when UW
returns it.
```

---

## Fix Group F — P4

---

### Bug #24c — Minor Markdown Issues in Coach Response

```
In artifacts/alpha-lens/src/pages/coach.tsx,
the AI Coach response renders some markdown
correctly (headers, bullets) but Charlize
reports "**" bold markers are still appearing
as raw text instead of bold.

This is likely a ReactMarkdown configuration
issue — the component needs the correct
plugins to handle all markdown syntax.

In coach.tsx, update the ReactMarkdown
component to ensure full markdown support:

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

Install if not present:
  pnpm --filter @workspace/alpha-lens
  add remark-gfm

Use:
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {message.content}
  </ReactMarkdown>

remarkGfm adds support for GitHub Flavored
Markdown including tables, strikethrough,
and proper bold/italic handling.

Apply the same remarkGfm plugin to all other
pages that use ReactMarkdown:
  briefing.tsx, scanner.tsx, market-detail.tsx,
  radar.tsx

Run pnpm run typecheck. Zero errors required.

Verify: Ask the AI Coach a question that
produces bold text in the response. Bold
markers should render as bold, not show
as "**text**".
```

---

## Fix Group G — P1 Persistent

---

### Bug #7 — BTC/ETH/SOL Cache (Escalated)

**This has been open since Phase 2 V1.**
**Charlize's note: "Try to make it show the
latest prices as much as possible."**

```
Bug #7 has been open for multiple rounds.
The previous fix addressed cache bypass on
manual refresh but Charlize still sees stale
prices on repeated refreshes.

Apply a more aggressive fix:

In artifacts/api-server/src/services/
market-data.ts:

1. Reduce the cache TTL from 30 seconds to
   10 seconds for the CoinGecko response.
   This means prices are at most 10 seconds
   stale instead of 30.

2. On every manual POST /api/markets/refresh
   call, ALWAYS bypass cache completely and
   fetch fresh from CoinGecko:
   - Clear the cache before fetching
   - Fetch fresh data
   - Update cache with fresh data
   - Return fresh data

3. Add a timestamp to the API response so
   the frontend can show "Last updated: X
   seconds ago" to the user. This gives
   Charlize visibility into data freshness
   without needing to compare against
   CoinGecko directly.

4. In the market data response for crypto
   assets, add a dataFreshness field:
   {
     ...asset,
     dataFreshness: {
       source: "CoinGecko",
       fetchedAt: ISO timestamp,
       cacheAge: seconds since last fetch
     }
   }

Run pnpm run typecheck. Zero errors required.

Verify: POST /api/markets/refresh twice in
rapid succession. Both calls should log
"CoinGecko: fresh prices fetched" and return
the current BTC price matching CoinGecko.com
within a few seconds tolerance.
```

---

## Verification Checklist

| # | Test | Pass Criterion |
|---|------|----------------|
| 1 | `pnpm run typecheck` | Zero errors |
| 2 | Login as Charlize, GET /api/portfolio | Fresh $10,000 portfolio, not James's data |
| 3 | Charlize opens paper trade | Appears only in Charlize's portfolio |
| 4 | James logs in, GET /api/portfolio | Sees only his own trades and balance |
| 5 | GET /api/portfolio without hardcoded value | Balance from DB, not hardcoded |
| 6 | GET /api/radar/macro/bea | Correct GDP with LineNumber=1 |
| 7 | POST /api/markets/refresh twice | 2nd returns refresh_already_running |
| 8 | GET /api/recommendations/briefing | sources array populated, not [] |
| 9 | DELETE /api/recommendations/watchlist/99999 | Returns 404 not success |
| 10 | POST /api/coach/analyze | Response includes direction per asset |
| 11 | POST /api/coach/analyze | No error text in response |
| 12 | GET /api/whales/flow-alerts | issue_type and sector populated |
| 13 | GET /api/whales/darkpool | sale_cond_codes populated |
| 14 | AI Coach bold text renders | No raw ** in coach response |
| 15 | POST /api/markets/refresh | BTC price matches CoinGecko.com |

---

## Notes for Charlize

**Phase 1 V2 Bug #3 (radar scan count):**
This was verified fixed — console shows
"E8: Radar scan complete { count: 48 }".
Please re-verify and update the spreadsheet
to Resolved if confirmed.

**Bug #24 outcome: null:**
This is NOT a bug. Outcome is null for all
new recommendations until the predicted
event resolves. This is the track record
system — outcome gets populated when we
verify whether the AI call was correct.
Close this sub-item as "Not a bug."

**Bug #23 (alert fields):**
Unusual Whales alerts intentionally populate
only the fields meaningful to that alert type.
This is confirmed correct behavior.
Status: close as "Not a bug" for UW alerts.

---

## Priority Order Summary

1. **Bugs #25 + #27** — Portfolio user scoping (P1 — fix first)
2. **Bug #28** — BEA LineNumber param (P1)
3. **Bug #16** — Market refresh lock (P3 — persistent)
4. **Bug #24a** — Sources [] in recommendations (P3)
5. **Bug #24b** — Watchlist delete 404 (P3)
6. **Bugs #26a + #26b** — Coach snapshot fixes (P3)
7. **Bugs #29a + #29b** — Whales null fields (P3)
8. **Bug #24c** — Coach markdown (P4)
9. **Bug #7** — CoinGecko cache (P1 — persistent)

---

*Arclion · Internal Bug Fix Document · Confidential · April 2026*
