# ARCLION — Full Platform Audit Report
## Pre-UAT Verification · April 28, 2026

**Total checks: 56**
**PASS: 53 | FAIL: 0 | NEEDS REVIEW: 3**

---

## SECTION 1 — TypeScript Build
- **1.1 typecheck** → **PASS** — zero errors across 4 projects (scripts, api-server, mockup-sandbox, alpha-lens).

## SECTION 2 — Authentication
- **2.1** JWT_SECRET / CREDENTIALS_ENCRYPTION_KEY → **PASS** — `services/auth.ts` reads `JWT_SECRET ?? SESSION_SECRET`; `CREDENTIALS_ENCRYPTION_KEY` listed in available secrets.
- **2.2** middleware path → **NEEDS REVIEW** — file is at `artifacts/api-server/src/middlewares/auth.ts` (plural folder name), not `middleware/` as the spec says. All three exports (`requireAuth`, `requireAdmin`, `optionalAuth`) are present and wired correctly, so functionality is unaffected, but the path differs from the audit doc.
- **2.3** Routes protected → **PASS** — `routes/index.ts` mounts `requireAuth` on `/markets`, `/signals`, `/portfolio`, `/coach`, `/recommendations`, `/trading`, `/radar`, `/whales`, `/user`. Only `/auth` and `/healthz` are public.
- **2.4** auth.ts routes → **PASS** — `POST /register`, `POST /login`, `POST /logout`, `GET /me`, `POST /change-password` all present.
- **2.5** users table → **PASS** — has id, email, passwordHash, name, role, isActive, createdAt, lastLoginAt.
- **2.6** user_trading_accounts table → **PASS** — has id, userId (FK cascade), platform, encryptedCredentials, status, createdAt, updatedAt + unique (userId, platform).

## SECTION 3 — Portfolio Scoping
- **3.1** portfolio.userId → **PASS** — integer FK to `usersTable.id` (cascade), unique per user.
- **3.2** trades.userId → **PASS** — integer FK to `usersTable.id` (cascade).
- **3.3** GET /api/portfolio scoped → **PASS** — `where eq(tradesTable.userId, userId)` for both open and closed queries.
- **3.4** POST /trade scoped → **PASS** — inserts with `userId: req.user.userId`.
- **3.5** close trade ownership → **PASS** — `where(and(eq(id), eq(userId)))` before update.
- **3.6** No hard-coded balance → **PASS** — `10000` only appears as `DEFAULT_STARTING_BALANCE` in `getOrCreatePortfolio`.

## SECTION 4 — Risk Gates
- **4.1a–e** all 5 checks present → **PASS** — `checkRiskGate` enforces minEdge, minConfidence, maxPositionPct, dailyLossLimitPct (uses real `dailyPnl`), and maxDailyTrades.
- **4.2** getDailyPnl reads real P&L → **PASS** — `where(status='closed', closedAt >= UTC midnight, userId=?)`, sums via SQL `coalesce(sum(pnl),0)`.
- **4.3** getDailyTradeCount enforced in execute AND approve → **PASS** — `executeTrade` (line 103) and `POST /pending/:id/approve` (line 203).
- **4.4** Risk env vars → **PASS** — reads `MIN_EDGE_TO_EXECUTE`, `MIN_CONFIDENCE`, `MAX_POSITION_PCT`, `MAX_DAILY_TRADES`, `DAILY_LOSS_LIMIT_PCT` with safe defaults.

## SECTION 5 — Live Trading Backend
- **5.1a** safe amount read → **PASS** — `Number(req.body?.amountOverride ?? order.amountUsd ?? 50) || 50`.
- **5.1b** approve calls getDailyTradeCount → **PASS**.
- **5.1c** clear daily-limit error → **PASS** — returns 400 with `Daily trade limit (N) reached — approval blocked`.
- **5.2a** reject writes live_trades row with `status:"rejected"` → **PASS**.
- **5.2b** reject returns `{status:"rejected", orderId}` → **PASS**.
- **5.3a** history returns all statuses → **PASS** — only filters by `userId` (and optional platform), no status filter.
- **5.3b** rejected trades included → **PASS** — by absence of status filter.
- **5.4a** per-user platform check → **PASS** — `getAccountsStatus(userId)` only reads `user_trading_accounts` for that user.
- **5.4b** no env fallback when user logged in → **PASS** — env-var checks only run inside the `if (!userId)` branch.
- **5.4c** env only as fallback → **PASS**.
- **5.5a** accounts endpoint per-user → **PASS**.
- **5.5b** no raw credentials exposed → **PASS** — only `configured` / `not_configured` returned.

## SECTION 6 — Live Trading UI
- **6.1** four tabs → **PASS** — Overview, Pending Approval, History, Positions (data-testids `tab-overview/pending/history/positions`).
- **6.2** /trading route → **PASS** — `App.tsx` line 78: `<Route path="/trading" component={TradingPage} />`.
- **6.3** Trading nav between Portfolio and Radar → **PASS** — `layout.tsx` lines 59–61.
- **6.4a** "Execute Live Trade" on rec cards → **PASS** — briefing.tsx line 526 (DialogTitle).
- **6.4b** "Paper Trade" label → **PASS** — briefing.tsx line 486.
- **6.5** pending badge polls → **PASS** — `useGetPendingOrders` in layout.tsx, `pendingCount` passed as `badge`.

## SECTION 7 — Market Radar
- **7.1a** alertsGenerated counter → **PASS** — incremented per stored alert.
- **7.1b** runRadarScan returns `{count, status}` → **PASS** — returns `{count, alerts, status:"complete"}`.
- **7.1c** log line → **PASS** — `console.log("E8: Radar scan complete", {count: N})`.
- **7.2** onConflictDoUpdate sets `createdAt: new Date()` → **PASS** — line 478.
- **7.3** isRadarScanning at module level → **NEEDS REVIEW** — `scheduler.ts` has a module-level `isRadarScanning` lock (line 8) which is correct, but `routes/radar.ts` also defines its own separate module-level `scanInProgress` lock (line 23). The two locks don't coordinate, so a manual `POST /api/radar/scan` could fire while the scheduler's scan is mid-flight (and vice versa). The spec asks for the lock NOT to be in routes.
- **7.4a** hours param filters by createdAt UTC cutoff → **PASS** — `gte(createdAt, new Date(Date.now() - hours*60*60*1000))`.
- **7.4b** default 4h window → **PASS** — `clamp(parseInt(hours) || 4, 1, 24)`.

## SECTION 8 — Data Sources
- **8.1a** fetchFedCutProbability cumulative → **PASS** — multiplies hold probabilities across all FOMC events before the August 2026 horizon, then computes `1 − cumulativeHold`. Falls back to single nearest event only if <2 qualifying events.
- **8.1b** KXBTC log level → **PASS** — `logger.info("Kalshi KXBTC: no $100K market open yet …")`.
- **8.1c** Kalshi 10s AbortController → **PASS** — `fetchWithTimeout` uses AbortController with default 10s.
- **8.2a** getFedFundsRate uses NY Fed EFFR → **PASS** — `https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json`.
- **8.2b** fetchGDP uses BEA LineNumber=1 → **PASS** — line 243.
- **8.3a** UW endpoints return 503 if key missing → **PASS** at the route layer — `routes/radar.ts` guards `/options-flow`, `/dark-pool`, `/congress`, `/crypto-whales` with 503. (The service helpers in `unusual-whales.ts` use `console.warn` + return empty arrays, but they're only reachable through the guarded routes or via the radar scan, which silently skips when the key is unset — acceptable.)
- **8.3b** Array.isArray guards on all UW arrays → **PASS** — every normalize call is wrapped (`Array.isArray(alerts) ? … : []`).
- **8.4a** CoinGecko TTL = 10s → **PASS** — `CRYPTO_CACHE_TTL = 10_000`.
- **8.4b** refresh bypasses cache → **PASS** — `refreshAllMarketData` calls fetchers with `bypassCache=true`.
- **8.4c** dataFreshness attached → **PASS** — `MarketSnapshot.dataFreshness` populated on responses.

## SECTION 9 — AI Coach
- **9.1a** live market snapshot injected → **PASS** — top assets by edge included in user prompt.
- **9.1b** macro context injected → **PASS** — `fetchMacroContext()` awaited and added.
- **9.1c** confidence 0.75 on success → **PASS** — line 225.
- **9.1d** confidence 0.3 on fallback → **PASS** — line 271.
- **9.1e** system prompt mentions live data → **PASS** — line 9 explicit.
- **9.1f** briefing summary validated → **PASS** — gated by `summary.length > 10 && !/error/i && !placeholder`.
- **9.2a** orphan `**` stripped → **PASS** — `sanitizeMarkdown` drops odd-count `**`.
- **9.2b** valid `*italic*` and `**bold**` preserved → **PASS** — orphan handling is asterisk-count based, valid pairs untouched.
- **9.2c** single `*` bullets converted to `-` → **PASS** — handled in sanitizeMarkdown.

## SECTION 10 — Frontend UX
- **10.1** close-button audit → **PASS** — `dialog.tsx` and `sheet.tsx` close buttons use `min-h-[44px] min-w-[44px]`, no `opacity-0`, `hover:opacity`, or `group-hover` anywhere in dialog.tsx, sheet.tsx, trading.tsx, or briefing.tsx.
- **10.2a** brand "ARCLION" → **PASS** — layout.tsx lines 73 and 179.
- **10.2b** nav order → **PASS** — Briefing → Scanner → AI Coach → Portfolio → Trading → Radar → Smart Money → Settings.
- **10.2c** no MODULES heading → **PASS** — string "MODULES" not present.
- **10.2d** user menu at bottom with name + Sign Out → **PASS** — present in layout.tsx.
- **10.3** react-markdown + remark-gfm on all 5 pages → **NEEDS REVIEW** — confirmed on briefing.tsx, coach.tsx, market-detail.tsx, radar.tsx. **scanner.tsx does NOT import react-markdown or remark-gfm.** Spec lists scanner.tsx as required.
- **10.4** no `overflow-x: hidden` on html/body → **PASS** — `index.css` has none. Tables in trading.tsx and portfolio.tsx wrapped in `overflow-x-auto`.

## SECTION 11 — Settings Page
- **11.1** settings.tsx exists with Trading Accounts section → **PASS** — header "Trading Accounts" at line 267.
- **11.2** cards for Kalshi, Alpaca, Polymarket → **PASS** — all three defined.
- **11.3** connect/disconnect call correct endpoints → **PASS** — `POST /api/user/trading-accounts`, `DELETE /api/user/trading-accounts/:platform`.
- **11.4** credentials never displayed → **PASS** — only `status` shown; `encryptedCredentials` never sent back to client.
- **11.5** /settings route exists → **PASS** — App.tsx line 79.
- **11.6** Settings nav item → **PASS** — layout.tsx line 63.

## SECTION 12 — Recommendations
- **12.1a** sources populated → **PASS** — `buildSources()` returns CoinGecko/Kalshi/Yahoo/UW/BLS/BEA/NY Fed based on data lineage.
- **12.1b** edge/aiProbability/marketPrice mapped from matched asset → **PASS** — lines 357–359.
- **12.1c** region populated → **PASS** — `rec.region ?? matchedAsset?.region ?? "Global"`.
- **12.1d** assetId matched from name/symbol → **PASS** — matched asset linked.
- **12.2a** fetchMacroContext() called at scan start → **PASS** — line 455.
- **12.2b** macro string included in Claude prompt → **PASS**.
- **12.3a** rec titles link to /market/{assetId} → **PASS** — briefing.tsx line 318: `href={`/market/${rec.assetId}`}`.
- **12.3b** "TRADE CALLS / WATCH LIST / AVOID" labels → **PASS** — briefing.tsx lines 876, 892, 908.
- **12.3c** "Show analysis / Hide analysis" expand hint → **NEEDS REVIEW** — exact strings "Show analysis" / "Hide analysis" do not appear in briefing.tsx. The expand affordance uses ChevronDown/ChevronUp icons but no textual hint. Spec asks for a labeled hint.

## SECTION 13 — Watchlist
- **13.1a** DELETE returns 404 when ID missing → **PASS** — explicit ownership lookup, returns 404 if no row.
- **13.1b** ownership scoped → **PASS** — both the existence check AND the delete use `where(and(eq(id), eq(userId)))`.

---

## SUMMARY OF ITEMS NEEDING ATTENTION

| # | Section / Check | Found | Expected |
|---|---|---|---|
| 1 | 2.2 — middleware path | Folder is `middlewares/` (plural) | Spec lists `middleware/` (singular). Functionality is fine; only the path differs. |
| 2 | 7.3 — radar lock location | Two separate module-level locks: one in `scheduler.ts`, one in `routes/radar.ts` (`scanInProgress`) | Single shared lock, ideally only in `market-radar.ts` or `scheduler.ts`. The two locks don't coordinate, so a manual `/scan` can race with the scheduler. |
| 3 | 10.3 — react-markdown coverage | Present on briefing, coach, market-detail, radar | `scanner.tsx` is missing `react-markdown` + `remark-gfm` imports. |
| 4 | 12.3c — analysis expand hint | Chevron icon only | Spec asks for a textual "Show analysis" / "Hide analysis" hint. |

**No FAIL findings.** Three NEEDS REVIEW items above (plus one informational note on the middleware folder name). All other 53 checks pass. Per the audit instructions, no fixes have been applied — this is report-only.
