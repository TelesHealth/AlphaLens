# Arclion — Full Platform Audit
## Pre-UAT Verification · April 2026

Paste this entire document into Replit AI.

---

## PURPOSE

Run a comprehensive audit of the Arclion platform
to verify that all bug fixes across Phase 2 V1-V7
are correctly in place. Do not apply new fixes —
audit and report only. Flag anything that looks
wrong, missing, or inconsistent.

Work through each section in order. For each check,
report: PASS, FAIL, or NEEDS REVIEW with a one-line
explanation.

---

## SECTION 1 — TypeScript Build

```
Run: pnpm run typecheck
Expected: Zero TypeScript errors across all packages.
Report the exact error count.
```

---

## SECTION 2 — Authentication

```
1. Verify JWT_SECRET and CREDENTIALS_ENCRYPTION_KEY
   are present in environment (do not log values).
   Expected: Both set.

2. Check artifacts/api-server/src/middleware/auth.ts
   exists and exports requireAuth, requireAdmin,
   optionalAuth.

3. Check artifacts/api-server/src/app.ts — all routes
   except /api/auth/* and /api/healthz are protected
   by requireAuth.

4. Check artifacts/api-server/src/routes/auth.ts
   exists with: POST /register, POST /login,
   POST /logout, GET /me, POST /change-password.

5. Check lib/db/src/schema/ has a users table with:
   id, email, passwordHash, name, role, isActive,
   createdAt, lastLoginAt.

6. Check lib/db/src/schema/ has user_trading_accounts
   table with: id, userId, platform,
   encryptedCredentials, status, createdAt, updatedAt.
```

---

## SECTION 3 — Portfolio User Scoping

```
1. Check lib/db/src/schema/ — portfolio table has
   userId column (integer, references users.id).

2. Check lib/db/src/schema/ — trades table has
   userId column.

3. Check artifacts/api-server/src/routes/portfolio.ts
   — GET /api/portfolio queries WHERE userId =
   req.user.userId (not all portfolios).

4. Check POST /api/portfolio/trade inserts with
   userId = req.user.userId.

5. Check POST /api/portfolio/trade/:id/close
   verifies the trade belongs to req.user.userId
   before closing.

6. Confirm no hardcoded balance values appear in
   route handlers or service responses (10000 should
   only appear as a default when creating a NEW
   portfolio row).
```

---

## SECTION 4 — Risk Gates

```
1. Check artifacts/api-server/src/services/trading.ts
   — checkRiskGate() function exists with all 5 checks:
   a. MIN_EDGE check (edge >= minimum)
   b. MIN_CONFIDENCE check
   c. MAX_POSITION_PCT check (uses portfolio value)
   d. DAILY_LOSS_LIMIT_PCT check — verify this reads
      real P&L from trades table since UTC midnight
      NOT a hardcoded zero value.
   e. MAX_DAILY_TRADES check

2. Verify getDailyPnl(userId) reads from tradesTable
   WHERE userId = userId AND closedAt >= midnight UTC.
   Confirm it is NOT returning 0 always.

3. Verify getDailyTradeCount(userId) is enforced at
   both executeTrade AND approvePendingOrder.
   Check both routes for this guard.

4. Verify risk config reads from environment:
   MIN_EDGE, MIN_CONFIDENCE, MAX_POSITION_PCT,
   MAX_DAILY_TRADES, DAILY_LOSS_LIMIT_PCT all read
   from process.env with correct defaults.
```

---

## SECTION 5 — Live Trading (E7)

```
1. Check artifacts/api-server/src/routes/trading.ts
   — POST /api/trading/pending/:id/approve:
   a. Does NOT crash on undefined amountOverride.
      Verify: const amountUsd = req.body?.amountOverride
      ?? order.amountUsd ?? 50 (or equivalent safe read)
   b. Calls getDailyTradeCount before approving.
   c. Returns clear error if daily limit reached.

2. Check POST /api/trading/pending/:id/reject:
   a. Writes a row to live_trades with
      status: "rejected" so it appears in history.
   b. Returns { status: "rejected", orderId: N }

3. Check GET /api/trading/history:
   a. Returns trades with status IN
      ('filled', 'rejected', 'approved') — NOT just filled.
   b. Confirm rejected trades are included.

4. Check artifacts/api-server/src/services/
   platform-router.ts:
   a. When userId is provided, ONLY checks
      user_trading_accounts for that user.
   b. Does NOT fall back to process.env.KALSHI_EMAIL
      when a logged-in user exists.
   c. Env vars are only used as fallback when
      userId is null/undefined.

5. Check GET /api/trading/accounts:
   a. Returns platform status based on the
      current user's user_trading_accounts rows.
   b. Never exposes raw credentials — only
      status (configured/not_configured).
```

---

## SECTION 6 — Live Trading UI

```
1. Check artifacts/alpha-lens/src/pages/trading.tsx
   exists with 4 tabs:
   Overview | Pending Approval | History | Positions

2. Check artifacts/alpha-lens/src/App.tsx has route:
   /trading → TradingPage component

3. Check artifacts/alpha-lens/src/components/layout.tsx
   has Trading nav item between Portfolio and Radar.

4. Check Briefing page (briefing.tsx) has:
   a. "Execute Live Trade" button on recommendation cards
   b. "Paper Trade" label on the paper trade button
      (not just "Execute")

5. Check Trading nav item has pending badge logic —
   polls GET /api/trading/pending and shows count
   when > 0.
```

---

## SECTION 7 — Market Radar (E8)

```
1. Check artifacts/api-server/src/services/
   market-radar.ts:
   a. alertsGenerated counter exists and increments
      per alert stored.
   b. runRadarScan() returns { count: alertsGenerated,
      status: "complete" }.
   c. Logs: "E8: Radar scan complete { count: N }"

2. Check storeAlerts uses onConflictDoUpdate with
   createdAt: new Date() in the set object so
   recurring alerts get fresh timestamps.

3. Check isRadarScanning lock is at MODULE level
   in market-radar.ts or scheduler.ts (not in routes).

4. Check GET /api/radar/alerts:
   a. hours parameter correctly filters by createdAt
      using UTC timestamp cutoff.
   b. Default 4h window returns recent alerts.
```

---

## SECTION 8 — Data Sources

```
1. Check artifacts/api-server/src/services/
   kalshi-markets.ts:
   a. fetchFedCutProbability() calculates CUMULATIVE
      probability across multiple FOMC events —
      not just nearest meeting.
   b. KXBTC "no $100K market" logs at console.log
      level (NOT console.warn or console.error).
   c. All Kalshi fetches have 10-second AbortController
      timeout.

2. Check artifacts/api-server/src/services/
   macro-data.ts:
   a. getFedFundsRate() calls NY Fed EFFR endpoint.
   b. fetchGDP() calls BEA API with LineNumber=1.

3. Check artifacts/api-server/src/services/
   unusual-whales.ts:
   a. Endpoints return 503 if UNUSUAL_WHALES_KEY
      not configured.
   b. Array.isArray guards on all UW response arrays.

4. Check market-data.ts:
   a. CoinGecko cache TTL is 10 seconds (not 30).
   b. Manual refresh (POST /api/markets/refresh)
      bypasses cache — always fetches fresh.
   c. dataFreshness field attached to market responses.
```

---

## SECTION 9 — AI Coach

```
1. Check artifacts/api-server/src/services/coach.ts:
   a. Every request injects live market snapshot
      (top 5 assets by edge).
   b. Every request injects macro context from
      fetchMacroContext().
   c. confidence = 0.75 on successful Claude response.
   d. confidence = 0.3 on fallback.
   e. System prompt tells Claude live data is available.
   f. Briefing summary is validated before injection
      (null/short/error summaries are excluded).

2. Check markdown sanitization:
   a. Orphan ** markers are stripped.
   b. Valid *italic* and **bold** are preserved.
   c. Single * bullets converted to - bullets.
```

---

## SECTION 10 — Frontend UX

```
1. Check all close/dismiss/X buttons across:
   artifacts/alpha-lens/src/components/ui/dialog.tsx
   artifacts/alpha-lens/src/components/ui/sheet.tsx
   artifacts/alpha-lens/src/pages/trading.tsx
   artifacts/alpha-lens/src/pages/briefing.tsx

   Search for: opacity-0, hover:opacity, group-hover
   Expected: NO close buttons with hover-dependent
   visibility. All close buttons must be opacity-100
   always with min-h-[44px] min-w-[44px].

2. Check artifacts/alpha-lens/src/components/
   layout.tsx:
   a. Brand name shows "ARCLION" not "ALPHA LENS"
   b. Nav order: Briefing → Scanner → AI Coach →
      Portfolio → Trading → Radar → Smart Money →
      Settings
   c. No "MODULES" heading above nav links.
   d. User menu at bottom of sidebar with name
      and Sign Out button.

3. Check react-markdown + remark-gfm is applied on:
   briefing.tsx, coach.tsx, scanner.tsx,
   market-detail.tsx, radar.tsx

4. Check mobile overflow:
   No overflow-x: hidden on html or body in
   artifacts/alpha-lens/src/index.css
   Tables are wrapped in overflow-x-auto containers.
```

---

## SECTION 11 — Settings Page

```
1. Check artifacts/alpha-lens/src/pages/settings.tsx
   exists with Trading Accounts section.

2. Check Trading Accounts section has cards for:
   Kalshi, Alpaca, Polymarket.

3. Check connect/disconnect flows call:
   POST /api/user/trading-accounts
   DELETE /api/user/trading-accounts/:platform

4. Check credentials are never displayed after saving
   (only status shown).

5. Check /settings route exists in App.tsx.

6. Check Settings nav item exists in layout.tsx.
```

---

## SECTION 12 — Recommendations

```
1. Check artifacts/api-server/src/services/
   recommendations.ts:
   a. sources array is populated on each recommendation
      (not empty []).
   b. edge, aiProbability, marketPrice are all mapped
      from matched asset (not null).
   c. region field is populated from Claude's response.
   d. assetId is matched from asset name/symbol.

2. Check macro context is injected into Claude's
   recommendation prompt:
   a. fetchMacroContext() is called at start of scan.
   b. Result is included in the prompt string.

3. Check briefing.tsx:
   a. Recommendation titles link to /market/{assetId}.
   b. "Trade Call" / "Watch" / "Avoid" text labels
      appear alongside icons.
   c. "Show analysis" / "Hide analysis" expand hint.
```

---

## SECTION 13 — Watchlist

```
1. Check DELETE /api/recommendations/watchlist/:id:
   a. Returns 404 when ID doesn't exist.
   b. Only allows deleting own watchlist items
      (WHERE id = :id AND userId = req.user.userId).
```

---

## FINAL REPORT FORMAT

After completing all 13 sections, provide a summary:

AUDIT COMPLETE — [DATE]
Total checks: N
PASS: N
FAIL: N
NEEDS REVIEW: N

List every FAIL and NEEDS REVIEW with:
- Section number and check number
- What was found
- What the correct state should be

If zero FAIL and zero NEEDS REVIEW: state
"Platform audit complete — all checks passed.
Ready for Phase 3 UAT."

Do NOT apply any fixes during this audit.
Report only.
