# Arclion — Replit Bug Fix Instructions
## Phase 2 Bug Report V2 · April 2026
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
- Reference `ALPHA_LENS__2_.xlsx` sheet "PHASE 2 BUG REPORT V2" for full bug details

---

## Bug Summary — 22 Total

| # | Severity | Title | Status |
|---|----------|-------|--------|
| 29 | **P1** | Daily loss hardcoded to zero — risk gate broken | Not fixed |
| 7  | **P1** | BTC/ETH/SOL prices not fresh | Not fixed |
| 25 | P2 | assetId null + region empty in recommendations | Not fixed |
| 27 | P2 | AI Coach not receiving asset context | Not fixed |
| 24 | P2 | Congress + crypto whale missing from Smart Money | Not fixed |
| 6  | P2 | CoinGecko 429 rate limit | Monitoring |
| 26 | P3 | aiReasoning null in open trades | Not fixed |
| 28 | P3 | assetId blank on pending trades | Not fixed |
| 30 | P3 | Alpaca routing equity vs equities case mismatch | Not fixed |
| 31 | P3 | Radar alerts not respecting time filter | Not fixed |
| 32 | P3 | Unknown integrations (Benzinga) — NOT A BUG | Intentional |
| 33 | P3 | Radar prices not sorted by pctChange | Not fixed |
| 34 | P3 | Recommendations don't link to asset detail | Not fixed |
| 16 | P3 | Refresh/scan lock — ask Charlize to retest first | Retest |
| 2  | P3 | Edge badge color — ask Charlize to hard-refresh first | Retest |
| 23 | P3 | Alert fields null (volumeMultiplier etc.) | Monitoring |
| 35 | P4 | Logo still says Alpha Lens | Not fixed |
| 36 | P4 | AI Coach introduces itself as Alpha Lens | Not fixed |
| 3  | P4 | Mobile horizontal scroll (Replit fix made it worse) | Not fixed |
| 10 | P4 | Markdown not rendering in recommendations | Not fixed |
| 22 | Enh | White screen on refresh | Not fixed |
| 37 | Enh | Watchlist toggle on scanner row | Not fixed |

---

## ⚠️ CRITICAL NOTE — Bug #29 is a Risk Control Failure

Bug #29 means the daily loss risk gate has NEVER worked correctly.
The code always reads daily loss as zero, so the 10% daily loss
limit (RG09 in the testing plan) never triggers. This must be
fixed before any live trading tests are considered valid.

Fix order: **#29 → #7 → #25 → #27 → #24 → #26/#28 → #30 → #31 → #33 → #34 → #35/#36 → #3 → #10**

---

## Fix Group A — P1 Critical (fix these first)

---

### Bug #29 — Daily Loss Value Hardcoded to Zero (RISK CONTROL FAILURE)

**Severity:** P1 — elevated from P2. Risk gate RG09 has never worked.
**Affected file:** `artifacts/api-server/src/services/trading.ts` or
wherever `checkRiskGate()` is implemented.

**Root cause:** The daily loss calculation passes a hardcoded value
of 0 instead of reading real-time P&L from closed trades today.
This means the DAILY_LOSS_LIMIT_PCT check (default 10%) never
triggers regardless of how much has been lost.

**Prompt for Replit AI:**

```
In the risk gate function (checkRiskGate() in the trading service),
find where daily loss is calculated. The bug report says the daily
loss value being passed is always hardcoded to zero.

Fix this by:

1. Query the trades/live_trades table for all trades that were
   closed today (executedAt or closedAt >= midnight UTC today).

2. Sum the pnl field for all losing trades (pnl < 0) to get
   the total daily loss amount.

3. Calculate daily loss percentage:
   dailyLossPct = Math.abs(totalDailyLoss) / portfolioValue

4. Compare against the DAILY_LOSS_LIMIT_PCT threshold
   (default 0.10 = 10%).

5. If dailyLossPct >= DAILY_LOSS_LIMIT_PCT, block the trade:
   "Daily loss limit reached — trading paused"

6. The existing getDailyTradeCount() function shows the pattern
   for querying today's trades — use the same midnight UTC
   calculation for the loss query.

After fixing, run pnpm run typecheck. Zero errors required.

Verify by checking that RG09 test case now works:
After losing $1,100+ on a $10,000 portfolio,
the next trade should be blocked with:
"Daily loss limit reached — trading paused"
```

---

### Bug #7 — BTC/ETH/SOL Prices Not Fresh

**Severity:** P1
**Affected file:** `artifacts/api-server/src/services/market-data.ts`

**Note:** This was marked resolved in our earlier analysis based
on README implementation notes. Charlize still sees it as not
fixed. The CoinGecko 30s TTL cache fix (Bug #6) may have
introduced stale data as a side effect.

**Prompt for Replit AI:**

```
Bug #7 and Bug #6 are related. The CoinGecko 30s TTL cache
was added to handle 429 rate limit errors, but it may be
causing crypto prices to always show cached/stale values
rather than fresh ones.

In artifacts/api-server/src/services/market-data.ts:

1. Find the CoinGecko price fetch with the 30s TTL cache.

2. Verify the cache invalidation logic is correct:
   - Cache should only be used when a 429 error occurs
   - On a successful fetch, the cache should always be
     updated with the fresh response
   - The cache should NOT be returned when a fresh fetch
     succeeds — only as a fallback on failure

3. Add a console.log after each successful CoinGecko fetch:
   "CoinGecko: fresh prices fetched for BTC=$X, ETH=$X, SOL=$X"
   This confirms the fetch is returning live data.

4. Add a console.warn when cache is used as fallback:
   "CoinGecko: using cached prices (rate limited)"

After fixing, compare BTC price in GET /api/markets with
current price on CoinGecko.com — they should match within
a reasonable tolerance (< $100 for BTC).

Run pnpm run typecheck. Zero errors required.
```

---

## Fix Group B — P2 High Priority

---

### Bug #25 — assetId Null + Region Empty in Recommendations

**Severity:** P2
**Affected file:** `artifacts/api-server/src/services/recommendations.ts`

**Prompt for Replit AI:**

```
In artifacts/api-server/src/services/recommendations.ts,
find where recommendation objects are built before saving
to the database.

Two fields are not being populated:

1. assetId is null — when building the recommendation,
   look up the asset from the fetched assets list by
   matching assetTitle against asset.name or asset.symbol.
   Set recommendation.assetId = matchedAsset.id
   Default to null only if no match found (acceptable).

2. region is empty string "" — Claude should be prompted
   to include a region for each recommendation.
   Valid values: "Middle East", "Asia-Pacific", "Europe",
   "Americas", "Africa", "Global"
   Add to the Claude prompt: "For each recommendation,
   include a region field with one of these values:
   Middle East, Asia-Pacific, Europe, Americas, Africa, Global"
   Parse region from Claude's JSON response and save it.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #27 — AI Coach Not Receiving Asset Context

**Severity:** P2
**Affected files:** `artifacts/alpha-lens/src/pages/coach.tsx`
and `artifacts/api-server/src/services/coach.ts`

**Root cause:** The assetId is not being sent from the frontend
to the API when the user asks a question about a specific asset.
Claude therefore has no asset context and gives generic responses.

**Prompt for Replit AI:**

```
Bug: When a user asks the AI Coach a question about an asset
(e.g., from the market detail page), the assetId is not being
passed to POST /api/coach/analyze. Claude has no asset context
and gives generic responses instead of asset-specific advice.

Fix in two places:

1. In the frontend coach page or market detail page
   (artifacts/alpha-lens/src/pages/coach.tsx or market-detail.tsx):
   - Find where POST /api/coach/analyze is called
   - Ensure assetId is included in the request body
     when the user is asking about a specific asset
   - If the coach is accessed from a market detail page,
     pre-populate the assetId from the URL parameter

2. In artifacts/api-server/src/services/coach.ts:
   - Verify that when assetId is provided, the service
     fetches the asset details from the database
   - Include the asset name, current price, AI probability,
     edge, direction, and recent signals in the Claude prompt
   - The prompt should say something like:
     "The user is asking about [asset name].
      Current price: $X, AI probability: X%, Edge: X pts,
      Direction: bullish/bearish"

Run pnpm run typecheck. Zero errors required.

Verify by navigating to a market detail page, clicking
AI Coach, asking "should I trade this?" — the response
should reference the specific asset by name.
```

---

### Bug #24 — Congress + Crypto Whale Sections Missing from Smart Money

**Severity:** P2
**Affected file:** `artifacts/alpha-lens/src/pages/whales.tsx`

**Prompt for Replit AI:**

```
On the /whales (Smart Money) page, the Congress Trades and
Crypto Whales sections are not visible. Only Options Flow
and Dark Pool are showing.

In artifacts/alpha-lens/src/pages/whales.tsx:

1. Find the tabs or sections that render the four Smart Money
   data categories.

2. Verify that Congress and Crypto Whales sections exist
   and are connected to:
   GET /api/whales/congress
   GET /api/whales/crypto-whales

3. If the sections exist but are not rendering, check that:
   - The API calls are being made (check network tab)
   - The response data structure matches what the component expects
   - There are no conditional renders hiding the sections

4. If the sections are missing entirely, add them following
   the same pattern as the Options Flow section, fetching
   from the endpoints above.

Run pnpm run typecheck. Zero errors required.
```

---

## Fix Group C — P3 Medium Priority

---

### Bugs #26 and #28 — aiReasoning Null + assetId Blank on Trades

**Fix together — same pattern, different tables.**

**Prompt for Replit AI:**

```
Two related null field bugs in the trading pipeline:

Bug #26: aiReasoning is null in open trades (trades table)
Bug #28: assetId is blank on pending trades (pending_orders table)

Fix both:

1. In the trade execution service, when creating a new trade
   record in the trades/live_trades table:
   - Populate aiReasoning from the recommendation's headline
     or why array (join as a string if array)
   - If no recommendation context is available, use:
     "Trade executed from AI recommendation"

2. In the pending order creation, when saving to pending_orders:
   - Populate assetId from recommendation.assetId
   - If recommendation.assetId is null, look up the asset
     by matching recommendation.assetTitle against assets table

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #30 — Alpaca Routing Case Mismatch (equity vs equities)

**Severity:** P3
**Affected file:** `artifacts/api-server/src/services/platform-router.ts`

**Prompt for Replit AI:**

```
In artifacts/api-server/src/services/platform-router.ts,
find the getBestPlatform() function where Alpaca routing
is determined by assetClass or sector.

The current check routes to Alpaca only when sector/assetClass
is exactly "equities" but misses "equity" (singular).

Fix the check to be case-insensitive and handle both forms:

const isEquity = (
  (rec.assetClass ?? '').toLowerCase() === 'stock' ||
  (rec.assetClass ?? '').toLowerCase() === 'etf' ||
  (rec.sector ?? '').toLowerCase() === 'equities' ||
  (rec.sector ?? '').toLowerCase() === 'equity'
);

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #31 — Radar Alerts Not Respecting Time Filter

**Severity:** P3
**Affected file:** `artifacts/api-server/src/routes/radar.ts`

**Root cause:** Date.now() may be returning server time that
doesn't match the expected UTC cutoff, causing alerts outside
the requested hours window to appear.

**Prompt for Replit AI:**

```
In artifacts/api-server/src/routes/radar.ts, find the
GET /api/radar/alerts endpoint where the hours parameter
is used to filter alerts.

The bug: alerts appear that are older than the requested
hours cutoff. The note says Date.now() is not accurate.

Fix by:

1. Use a consistent UTC timestamp for the cutoff calculation:
   const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

2. Ensure the database query uses UTC comparison:
   WHERE createdAt >= cutoff (in UTC)

3. Ensure the hours parameter is clamped correctly (1-24).

4. Apply the same UTC-consistent time approach to any other
   time-based filtering in the radar routes (history endpoint,
   alert cooldown checks in market-radar.ts).

The note says: "Any time-related fix done here should be
applied universally to ensure time accuracy."

Run pnpm run typecheck. Zero errors required.

Verify: GET /api/radar/alerts?hours=1 should only return
alerts from the last 60 minutes, not older alerts.
```

---

### Bug #33 — Radar Prices Not Sorted by pctChange

**Severity:** P3
**Affected file:** `artifacts/api-server/src/routes/radar.ts`

**Prompt for Replit AI:**

```
In artifacts/api-server/src/routes/radar.ts, find the
GET /api/radar/prices endpoint.

The prices array is not correctly sorted by pctChange.
The current sort mixes positive and negative values
(e.g., +2.1%, -0.5%, +1.3%) instead of ordering them.

Fix the sort to be descending by absolute pctChange value,
so the most significant moves (positive or negative) appear
first:

prices.sort((a, b) =>
  Math.abs(b.pctChange ?? 0) - Math.abs(a.pctChange ?? 0)
);

Alternatively, sort by raw pctChange descending
(highest positive first, most negative last) if that
is the intended behavior per the testing plan spec.

Handle null pctChange values — treat as 0 in the sort.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #34 — Recommendations Don't Link to Asset Detail

**Severity:** P3
**Affected file:** `artifacts/alpha-lens/src/pages/briefing.tsx`

**Prompt for Replit AI:**

```
In artifacts/alpha-lens/src/pages/briefing.tsx, find the
RecommendationCard component.

Each recommendation has an assetId field. Add a clickable
link on the asset title within each recommendation card
that navigates to /market/{assetId} when clicked.

Use the wouter Link component:
import { Link } from "wouter";

In the card, wrap the asset title:
{rec.assetId ? (
  <Link href={`/market/${rec.assetId}`}>
    <span className="hover:underline cursor-pointer text-primary">
      {rec.assetTitle}
    </span>
  </Link>
) : (
  <span>{rec.assetTitle}</span>
)}

This requires Bug #25 to be fixed first so assetId is
populated in the recommendations table.

Run pnpm run typecheck. Zero errors required.
```

---

## Fix Group D — P4 and Branding

---

### Bugs #35 and #36 — Branding: Logo + AI Coach Still Say Alpha Lens

**Fix both together.**

**Prompt for Replit AI:**

```
Two branding issues where "Alpha Lens" still appears
after the nav rename to "ARCLION":

Bug #35: The logo image/text in the sidebar still shows
"Alpha Lens" instead of "ARCLION".

In artifacts/alpha-lens/src/components/layout.tsx:
- Find any text node that renders "ALPHA LENS" or "Alpha Lens"
  that was missed in the earlier rename.
- Also check if there is an alt text on the logo image
  that says "Alpha Lens Logo" — update to "Arclion Logo"
- Check the page <title> in artifacts/alpha-lens/index.html
  — update from "Alpha Lens" to "Arclion" if present.

Bug #36: The AI Coach introduces itself as "Alpha Lens".

In artifacts/api-server/src/services/coach.ts:
- Find the COACH_PROMPT system prompt string.
- Replace any mention of "Alpha Lens" or "AlphaLens"
  with "Arclion".
- The AI should say "I am Arclion's AI trading coach"
  not "I am the Alpha Lens AI coach".

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #3 — Mobile Horizontal Scroll (Replit's fix made it worse)

**Severity:** P4
**Note from Charlize:** "The fix done by Replit eliminated the
horizontal scroll which made the site even less responsive.
It should be made responsive on mobile without the overflow hidden."

**Prompt for Replit AI:**

```
The previous mobile scroll fix used overflow-x: hidden on
html/body which eliminated horizontal scroll but broke
responsive layout. Charlize reports the site is now
less responsive on mobile as a result.

Revert the overflow-x: hidden approach and replace with
proper responsive layout fixes:

1. In the global CSS (artifacts/alpha-lens/src/index.css),
   remove any overflow-x: hidden on html or body.

2. Instead, find specific components that are too wide
   for mobile and fix them individually:
   - Tables: wrap in <div style="overflow-x: auto">
     so tables scroll within their container only
   - Wide cards or grids: use responsive grid classes
     grid-cols-1 on mobile, grid-cols-2 or 3 on larger screens
   - Any fixed-width elements > 375px: replace with
     max-w-full or w-full

3. Test at 375px viewport width (iPhone SE) — no page-level
   horizontal scroll should exist, but table containers
   may scroll horizontally on their own.

Run pnpm run typecheck. Zero errors required.
```

---

### Bug #10 — Markdown Not Rendering in Recommendations

**Severity:** P4
**Note:** Markdown was fixed for the AI Coach response but
Charlize reports recommendations from the briefing scan
still show raw markdown (asterisks etc.).

**Prompt for Replit AI:**

```
The react-markdown fix was applied to the AI Coach (/coach page)
but the recommendation cards on /briefing still render raw
markdown text with asterisks and other symbols.

In artifacts/alpha-lens/src/pages/briefing.tsx, find the
RecommendationCard component where the why array, headline,
historicalContext, and bearCase fields are rendered.

Apply react-markdown rendering to any of these fields that
may contain markdown from Claude:

import ReactMarkdown from 'react-markdown'

Replace plain text renders like:
  <p>{rec.headline}</p>
With:
  <ReactMarkdown>{rec.headline ?? ''}</ReactMarkdown>

Apply to: headline, historicalContext, bearCase, and
any items in the why array that are rendered as text.

Run pnpm run typecheck. Zero errors required.
```

---

## NOT A BUG — Bug #32 (Benzinga / "Bazinga")

Bug #32 reports "Unknown Integrations (Bazinga)" with 7 sources
instead of 5. This is intentional. We added:

- `bls` — BLS macro data (CPI, unemployment) — free
- `treasury` — US Treasury (Fed funds rate) — free, no key needed
- `bea` — BEA (GDP) — free
- `benzinga` — planned placeholder (shows as "planned" not "active")

Charlize spelled it "Bazinga" — the actual name is Benzinga.
No fix needed. Respond to Charlize explaining these are
intentional new data sources added as part of the macro
intelligence upgrade. Benzinga is a planned future integration.

---

## Fix Completion Checklist

After all fixes are applied, verify:

| # | Verification | Pass/Fail |
|---|--------------|-----------|
| 1 | `pnpm run typecheck` — zero errors | |
| 2 | RG09: After $1,100 loss on $10K portfolio, next trade blocked | |
| 3 | BTC/ETH/SOL price matches CoinGecko within tolerance | |
| 4 | Console shows "CoinGecko: fresh prices fetched" on refresh | |
| 5 | GET /api/recommendations/briefing — assetId non-null on recs | |
| 6 | GET /api/recommendations/briefing — region not empty string | |
| 7 | AI Coach from market detail page references asset by name | |
| 8 | /whales shows all 4 sections: Options Flow, Dark Pool, Congress, Crypto Whales | |
| 9 | GET /api/trading/history — aiReasoning field populated | |
| 10 | GET /api/trading/pending — assetId not blank | |
| 11 | Alpaca routes correctly for sector "equity" (not just "equities") | |
| 12 | GET /api/radar/alerts?hours=1 — only returns last 60 min alerts | |
| 13 | GET /api/radar/prices — sorted by pctChange (most significant first) | |
| 14 | Briefing recommendation cards link to /market/{assetId} | |
| 15 | Sidebar shows ARCLION — no Alpha Lens text anywhere | |
| 16 | AI Coach introduces itself as Arclion, not Alpha Lens | |
| 17 | index.html title tag says Arclion | |
| 18 | Mobile at 375px — no page-level horizontal scroll | |
| 19 | Recommendation cards render formatted text (no asterisks) | |

---

## Priority Order Summary

Fix in this sequence:

1. **Bug #29** — Daily loss hardcoded to zero (RISK CONTROL — fix first)
2. **Bug #7** — BTC/ETH/SOL prices stale
3. **Bug #25** — assetId null + region empty in recommendations
4. **Bug #27** — AI Coach not receiving asset context
5. **Bug #24** — Congress + crypto whale missing from Smart Money
6. **Bugs #26 + #28** — aiReasoning + assetId null on trades
7. **Bug #30** — Alpaca equity routing case mismatch
8. **Bug #31** — Radar alerts time filter inaccurate
9. **Bug #33** — Radar prices sort order
10. **Bug #34** — Recommendations link to asset (needs #25 first)
11. **Bugs #35 + #36** — Branding: Alpha Lens → Arclion
12. **Bug #3** — Mobile responsive (revert overflow-x: hidden)
13. **Bug #10** — Markdown in recommendation cards
14. **Enhancements #22, #37** — after all bugs fixed

---

*Arclion · Internal Bug Fix Document · Confidential · April 2026*
