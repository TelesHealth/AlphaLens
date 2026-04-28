# Arclion — Replit Bug Fix Instructions
## Phase 2 Bug Report V5 · April 2026
**Internal codename:** AlphaLens | **Company:** Arclion

---

## READ THIS FIRST

pnpm workspace monorepo. After every fix group:
- Run `pnpm run typecheck` — zero errors required
- Apply one fix group at a time
- Verify with Postman or browser before marking done

Fix order: **#30 → #27 → #31 → #29 → #24 → #25 → #26 → #27p4**

---

## Bug Summary

| # | Sev | Title | Status |
|---|-----|-------|--------|
| 30 | **P1** | User Trading Accounts Settings page missing | Not fixed |
| 27 | **P1** | Hardcoded portfolio value (persistent) | Not fixed |
| 31 | P2 | Kalshi warn/error on fetch in console | Not fixed |
| 29 | P3 | Dark pool null fields (sale_cond_codes, trade_code) | Not fixed |
| 24 | P4 | Markdown inconsistent in coach response | Not fixed |
| 25 | P4 | Exit button not visible on mobile/tablet | Not fixed |
| 26 | P4 | Mobile not fully responsive | Not fixed |
| 27p4 | P4 | Smart Money loading state on slow connection | Not fixed |

---

## Fix Group A — P1 Critical

---

### Bug #30 — User Trading Accounts Settings Page (P1 — NEW)

**Root cause:** The backend routes for per-user trading
credentials were built during auth implementation:
  POST /api/user/trading-accounts
  GET /api/user/trading-accounts
  DELETE /api/user/trading-accounts/:platform

But no frontend settings page was built. Users have
no UI to enter their own Kalshi/Alpaca credentials.
The /settings page only shows change password.

```
Build a user trading accounts settings page in
the Arclion frontend.

STEP 1 — Create settings page

In artifacts/alpha-lens/src/pages/settings.tsx,
add a Trading Accounts section below the existing
change password section.

The Trading Accounts section shows three platform
cards: Kalshi, Alpaca, and Polymarket.

Each card shows:
- Platform name and logo/icon
- Current status (Configured / Not configured)
- Connect button (if not configured)
- Disconnect button (if configured)
- Never show credentials after saving

STEP 2 — Kalshi connection form

When user clicks Connect on Kalshi card,
show an inline form:
  Email: [input]
  Password: [input type=password]
  [Save] [Cancel]

On Save: POST /api/user/trading-accounts
Body: {
  platform: "kalshi",
  credentials: { email, password }
}

On success: show green "Connected" status.
On error: show error message below form.

STEP 3 — Alpaca connection form

When user clicks Connect on Alpaca card,
show an inline form:
  API Key: [input]
  Secret Key: [input type=password]
  [Save] [Cancel]

On Save: POST /api/user/trading-accounts
Body: {
  platform: "alpaca",
  credentials: { apiKey, secretKey }
}

STEP 4 — Polymarket connection form

When user clicks Connect on Polymarket card,
show an inline form with a note:
  "Polymarket is only available outside the US"
  Private Key: [input type=password]
  [Save] [Cancel]

On Save: POST /api/user/trading-accounts
Body: {
  platform: "polymarket",
  credentials: { privateKey }
}

STEP 5 — Disconnect

Each configured platform shows a Disconnect button.
On click: show confirmation dialog
"Remove [Platform] credentials? You will need
to reconnect to execute live trades."
On confirm: DELETE /api/user/trading-accounts/
  {platform}

STEP 6 — Load current status

On page load: GET /api/user/trading-accounts
For each platform in the response,
show status: "Configured" with green indicator.
For platforms not in the response,
show status: "Not configured" with gray indicator.

STEP 7 — Add /settings to navigation

In artifacts/alpha-lens/src/components/layout.tsx,
add a Settings nav item:
{ href: "/settings", label: "Settings",
  icon: Settings }

Import Settings icon from lucide-react.

Place it at the bottom of the nav list,
above the user menu.

STEP 8 — Add route in App.tsx

In artifacts/alpha-lens/src/App.tsx,
add the route:
<Route path="/settings"
  component={SettingsPage} />

Security note: The settings page is protected
by the existing auth guard. Only logged-in
users can access it.

Run pnpm run typecheck. Zero errors required.

Verify:
1. Navigate to /settings in the browser
2. Trading Accounts section shows Kalshi,
   Alpaca, Polymarket cards
3. Click Connect on Kalshi — form appears
4. Enter test credentials and save —
   card shows "Configured"
5. Click Disconnect — credentials removed,
   card shows "Not configured"
6. Settings link appears in nav sidebar
```

---

### Bug #27 — Hardcoded Portfolio Value (P1 — Persistent)

**This was supposedly fixed in V4 but Charlize
still sees it. Apply a targeted investigation
and definitive fix.**

```
Bug #27 is still showing hardcoded portfolio values.
The V4 fix may have missed some code paths.

Do a comprehensive search and fix:

1. Search the entire codebase for hardcoded
   portfolio values. Run:
   grep -r "10000" artifacts/api-server/src/
   grep -r "initialBalance" artifacts/api-server/src/
   grep -r "balance.*10000" artifacts/

   Find every instance where 10000 appears as
   a numeric literal in portfolio-related code.

2. The ONLY acceptable place for 10000 is:
   When creating a NEW portfolio for a new user
   for the first time:
   db.insert(portfolio).values({
     userId: req.user.userId,
     balance: 10000,        ← only here
     initialBalance: 10000  ← only here
   })

3. All other references must read from the
   database. Fix any route or service that
   returns a hardcoded portfolio value in
   its response.

4. Also check: when GET /api/portfolio is
   called and no portfolio exists for this
   user, does it create one correctly with
   userId = req.user.userId? Or does it
   return a hardcoded response?

5. Check GET /api/portfolio/stats — confirm
   the balance field reads from DB not a
   hardcoded value.

Run pnpm run typecheck. Zero errors required.

Verify:
1. Login as Charlize
2. GET /api/portfolio — balance should be
   her actual current balance (not hardcoded)
3. Open and close a paper trade that changes
   her balance
4. GET /api/portfolio again — balance should
   reflect the trade result, not reset to 10000
```

---

## Fix Group B — P2

---

### Bug #31 — Kalshi Warn/Error on Fetch (P2)

**Kalshi's prediction market price API is public
and requires no auth. Console errors suggest
either an unnecessary auth header is being sent,
a timeout is occurring, or a CORS issue.**

```
In artifacts/api-server/src/services/
kalshi-markets.ts, investigate and fix the
console warn/error appearing on Kalshi fetches.

Common causes to check:

1. Auth header being sent unnecessarily:
   Kalshi's public market data API does not
   require any Authorization header.
   Confirm no auth headers are being sent:
   fetch(url, {
     headers: {
       "Content-Type": "application/json"
       // NO Authorization header here
     }
   })

2. Timeout too short:
   If the fetch timeout is too aggressive,
   Kalshi may be timing out on slow responses.
   Ensure timeout is at least 10 seconds:
   const controller = new AbortController();
   const timeout = setTimeout(
     () => controller.abort(), 10000
   );

3. Rate limiting:
   Check if Kalshi is returning 429.
   If so, implement exponential backoff:
   Wait 1s on first retry, 2s on second, 4s max.

4. Response parsing error:
   If the warn is "Unexpected field" or similar,
   Kalshi may have changed their API response
   shape. Log the raw response before parsing
   to see what's coming back.

5. Add proper error classification to the logs:
   - 429 rate limit: console.warn with retry info
   - 4xx client error: console.error with status
   - 5xx server error: console.error with status
   - Network timeout: console.warn with timeout info
   - Success: console.log with price data

After fixing: the only console output from
Kalshi calls should be the success log:
"Kalshi KXFED: cumulative cut probability by
July 2026 = X% across N FOMC events"

Run pnpm run typecheck. Zero errors required.

Verify: POST /api/markets/refresh — check server
console. No warn or error from Kalshi calls.
Only success log lines should appear.
```

---

## Fix Group C — P3

---

### Bug #29 — Dark Pool Null Fields (P3 — Persistent)

**Charlize confirms sale_cond_codes and trade_code
are still null after the V4 fix. The field
normalization is not working for these two fields.**

```
In artifacts/api-server/src/services/
unusual-whales.ts, find the dark pool data
mapping function.

The V4 fix added fallback field names but
sale_cond_codes and trade_code are still null.

Debug the actual Unusual Whales dark pool
API response by adding a temporary log:

console.log("UW darkpool raw fields:",
  Object.keys(trade))

This shows exactly what field names UW returns.
Once you see the actual field names, map them:

Common UW darkpool field variations:
  sale_cond_codes might be:
    trade.sale_conditions
    trade.conditions
    trade.sale_cond
    trade.flags
  trade_code might be:
    trade.type
    trade.trade_type
    trade.side
    trade.aggressor

After identifying the correct field names
from the log output, update the mapping:

sale_cond_codes: trade.sale_conditions
  ?? trade.conditions
  ?? trade.flags
  ?? null,

trade_code: trade.trade_type
  ?? trade.type
  ?? trade.side
  ?? null,

Remove the temporary log after fixing.

Run pnpm run typecheck. Zero errors required.

Verify: GET /api/whales/darkpool — sale_cond_codes
and trade_code should be non-null when UW
returns them. If UW genuinely does not return
these fields at all, document that clearly
in a code comment and set to null explicitly.
```

---

## Fix Group D — P4

---

### Bug #24 — Markdown Inconsistent in Coach (P4 — Persistent)

**remark-gfm was added in V4 but bold markers
still appear in some responses. The issue is
that Claude is generating markdown that doesn't
always follow consistent patterns.**

```
Two-part fix for inconsistent markdown:

PART 1 — System prompt enforcement
In artifacts/api-server/src/services/coach.ts,
update the coach system prompt to explicitly
forbid raw asterisks in output:

Add to the system prompt:
"FORMATTING RULES:
- Use markdown formatting for all responses
- Bold text: use **word** syntax (will render correctly)
- Never use * for bullet points — use - instead
- Never output raw asterisks as emphasis markers
- Structure responses with clear headers using ##
- Keep responses concise and scannable"

PART 2 — Pre-render sanitization
Before passing the coach response to the
frontend, add a sanitization step in the
API response:

In artifacts/api-server/src/routes/coach.ts
or the coach service, after getting Claude's
response, clean common markdown artifacts:

// Replace orphaned asterisks that aren't
// valid bold/italic markers
const cleanResponse = response
  .replace(/\*(?!\*)/g, '-') // single * → -
  .replace(/^\* /gm, '- ')   // * bullet → - bullet

Then apply this to the analysis field before
returning it in the API response.

Run pnpm run typecheck. Zero errors required.

Verify: Ask the coach 5 different questions.
None of the responses should contain raw **
or * symbols. All bold text should render
as bold in the UI.
```

---

### Bug #25 — Exit Button Not Visible on Mobile (P4)

**X button on popups only shows on hover.
Mobile/tablet has no hover state so the button
is invisible and the popup cannot be closed.**

```
In all dialog/modal/sheet components used
across the app, find where the close X button
visibility is controlled.

The likely cause: close button uses
opacity-0 group-hover:opacity-100 or similar
hover-dependent visibility class.

Fix: Make close buttons always visible on
touch devices.

Search for close button patterns in:
  artifacts/alpha-lens/src/components/ui/
    dialog.tsx
    sheet.tsx
    alert-dialog.tsx

And in page components that use Dialog or Sheet:
  artifacts/alpha-lens/src/pages/briefing.tsx
  artifacts/alpha-lens/src/pages/portfolio.tsx
  artifacts/alpha-lens/src/pages/trading.tsx

Fix pattern — replace hover-dependent opacity:
  // BEFORE (invisible on mobile):
  className="opacity-0 group-hover:opacity-100"

  // AFTER (always visible):
  className="opacity-100"

  Or use responsive approach:
  className="opacity-100 md:opacity-0
    md:group-hover:opacity-100"
  This keeps hover behavior on desktop but
  always shows on mobile.

Run pnpm run typecheck. Zero errors required.

Verify on mobile browser or Chrome DevTools
mobile simulation (375px):
- Open any dialog or sheet
- X button should be immediately visible
  without needing to hover
- Tapping X should close the dialog
```

---

### Bug #26 — Mobile Not Fully Responsive (P4 — Persistent)

**Charlize's specific requirements:**
- Stack elements vertically on mobile
- No page-level horizontal scroll
- Only table containers scroll horizontally
- Same principle for tablet

```
Apply comprehensive mobile responsive fixes
across the entire frontend.

Charlize's exact spec:
"Mobile layout should stack elements vertically.
No full page horizontal scroll. Only include
horizontal scroll on wide containers and sections
like tables. Same for tablet — stack vertically,
only add horizontal scroll to wide tables."

Fix in order:

STEP 1 — Global CSS
In artifacts/alpha-lens/src/index.css:
Remove any overflow-x: hidden on html/body
(this was the previous broken fix).
Do NOT add it back.

STEP 2 — Page layouts
For each page, find grid or flex layouts
that sit side-by-side on desktop.

Apply responsive grid classes:
  Desktop 2-col:
    className="grid grid-cols-1 md:grid-cols-2"
  Desktop 3-col:
    className="grid grid-cols-1 md:grid-cols-3"

Pages to check:
  briefing.tsx — Trade Calls + Global Events
    side by side. Should stack on mobile.
  scanner.tsx — filter row should wrap on mobile
  radar.tsx — alert cards should stack
  portfolio.tsx — stats cards should stack
  whales.tsx — tabs should be scrollable on mobile

STEP 3 — Tables
Every table must be wrapped in a scrollable
container:
  <div className="overflow-x-auto w-full">
    <table>...</table>
  </div>

Search for all <table> elements and ensure
each has this wrapper. The table can scroll
horizontally but the page cannot.

STEP 4 — Text and padding
On mobile, reduce padding on cards:
  className="p-4 md:p-6"
Ensure text doesn't overflow containers:
  className="truncate" or "break-words"
  on long text fields like asset names.

STEP 5 — Navigation
On mobile, the sidebar should collapse.
Check that layout.tsx has a mobile hamburger
menu or bottom navigation that doesn't
push content off-screen.

STEP 6 — Test at these breakpoints:
  375px — iPhone SE (minimum)
  390px — iPhone 14
  768px — iPad (tablet)
  1024px — Desktop minimum

Run pnpm run typecheck. Zero errors required.

Verify in Chrome DevTools:
At 375px: no horizontal scroll on any page.
At 768px: grid layouts stack appropriately.
Tables scroll horizontally within their
containers but do not cause page scroll.
```

---

### Bug #27p4 — Smart Money Loading State on Slow Connection (P4)

**On 3G connection, Smart Money page shows
"Unusual Whales not configured" instead of
a loading spinner during the API call.**

```
In artifacts/alpha-lens/src/pages/whales.tsx,
find where the Unusual Whales status check
and data fetch happen.

Root cause: The component renders the
"not configured" error state before the
API call completes, treating a pending
request as a configuration failure.

Fix with proper loading state management:

1. Add an isLoading state for the initial
   status check:
   const [isLoading, setIsLoading] = useState(true)
   const [isConfigured, setIsConfigured] =
     useState(false)

2. Show a loading spinner while the status
   check is in progress (isLoading === true)

3. Only show "not configured" error after
   the status check COMPLETES and returns
   not_configured — never during loading.

4. For each data section (Options Flow,
   Dark Pool, Congress, Crypto Whales),
   show individual loading skeletons while
   data is fetching.

5. On slow connections, increase the timeout
   for the Unusual Whales status check from
   the default to 15 seconds before showing
   an error state.

The loading state logic:
  isLoading === true → show spinner
  isLoading === false && isConfigured → show data
  isLoading === false && !isConfigured → show
    "Unusual Whales not configured" message

Run pnpm run typecheck. Zero errors required.

Verify using Chrome DevTools Network tab:
Set network to "Slow 3G"
Navigate to /whales (Smart Money page)
Should see loading spinner first
Then data loads (or configured error if key missing)
Should NOT immediately show "not configured"
```

---

## Verification Checklist

| # | Test | Pass Criterion |
|---|------|----------------|
| 1 | `pnpm run typecheck` | Zero errors |
| 2 | Navigate to /settings | Settings page loads with Trading Accounts section |
| 3 | Connect Kalshi in settings | Form saves, card shows Configured |
| 4 | Disconnect Kalshi | Card shows Not configured |
| 5 | Settings link in nav | Settings appears in sidebar nav |
| 6 | GET /api/portfolio as Charlize | Real balance from DB, not hardcoded 10000 |
| 7 | Change balance via trade, GET again | Balance reflects trade, not reset |
| 8 | POST /api/markets/refresh console | No Kalshi warn or error lines |
| 9 | GET /api/whales/darkpool | sale_cond_codes and trade_code non-null |
| 10 | Ask coach 5 questions | No raw ** or * in any response |
| 11 | Open any dialog on mobile (375px) | X button immediately visible |
| 12 | Browse all pages at 375px | No page-level horizontal scroll |
| 13 | Browse all pages at 375px | Elements stack vertically |
| 14 | Any table at 375px | Table scrolls horizontally, page does not |
| 15 | /whales on Slow 3G (DevTools) | Loading spinner before data or error |

---

## Notes for Charlize

**Phase 1 V2 Bug #3 (radar scan count):**
Still showing Not fixed in spreadsheet. Please
re-verify by running POST /api/radar/scan,
waiting 30 seconds, and checking the server
console for:
  E8: Radar scan complete { count: N }
If count > 0, mark Resolved.

**Bug #30 is the most impactful new bug.**
Without the settings page, users cannot
connect their own Kalshi/Alpaca accounts
through the UI. This is required before
any live trading with personal accounts
can happen.

**After V5 is complete, Phase 2 is done.**
The remaining items after this are all
Phase 3 (student UAT) or post-launch work.

---

## Priority Order Summary

1. **Bug #30** — Settings page for trading accounts (P1 — build first)
2. **Bug #27** — Hardcoded portfolio (P1 — persistent)
3. **Bug #31** — Kalshi console errors (P2)
4. **Bug #29** — Dark pool null fields (P3 — persistent)
5. **Bug #24** — Coach markdown inconsistent (P4)
6. **Bug #25** — Exit button mobile (P4)
7. **Bug #26** — Mobile responsive (P4)
8. **Bug #27p4** — Smart Money loading state (P4)

---

*Arclion · Internal Bug Fix Document · Confidential · April 2026*
