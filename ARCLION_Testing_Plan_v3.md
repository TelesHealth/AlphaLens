# ARCLION

## Comprehensive Testing Plan
### Pre-Production Quality Assurance & User Acceptance Testing
**Version 3.0 · April 2026**

| Testing Team | Location | Focus Area | Size |
|---|---|---|---|
| Philippines Team | Manila / Remote | Functional, API, International access | TBD |
| Finance Students | Local University | UX, Paper trading, Recommendations | TBD |
| Core Team (You) | US | Live trading, Kalshi, Risk controls, Auth | 1 |

---

## 1. Testing Overview

This plan covers pre-production testing of ARCLION — the AI-powered global investment intelligence platform. Testing is organized into four phases across three tester groups: the Philippines team (technical and functional testing), local finance students (user experience and learning module testing), and the core team (live trading, authentication, and risk control validation).

**Goal**
Ensure ARCLION is stable, accurate, and intuitive before opening to real users and live trading capital. Every critical path — from login through market scanning, AI recommendations, AI Coach commentary with live data, paper and live trade execution, and macro intelligence — must be verified by at least two independent testers.

### 1.1 Testing Phases

| Phase | Name | Duration | Who | What |
|---|---|---|---|---|
| 1 | Infrastructure & Setup | Week 1 | Philippines team | Environment, APIs, database, all integrations connecting, auth & sessions |
| 2 | Functional Testing | Weeks 2–3 | Philippines team + Core | Every feature, every screen, every API endpoint |
| 3 | User Acceptance Testing | Week 4 | Finance students | Real usage scenarios, paper trading, AI Coach Q&A |
| 4 | Pre-Launch Validation | Week 5 | All teams | Live trading dry run, load test, security review, sign-off |

### 1.2 Devices and Environments

ARCLION must work on all of these. Each tester should test on at least two:

| Device | Browser | Priority | Assigned to |
|---|---|---|---|
| Desktop / Laptop | Chrome 120+ | Critical | All teams |
| Desktop / Laptop | Firefox, Edge, Safari | High | Philippines team |
| Android smartphone | Chrome Mobile | Critical | Finance students + Philippines |
| iPhone / iPad | Safari Mobile | High | Finance students |
| Tablet (any) | Any browser | Medium | Finance students |
| Slow connection (3G sim) | Chrome | High | Philippines team — real-world condition |

---

## 2. Tester Roles and Responsibilities

### 2.1 Philippines Team
The Philippines team handles technical and functional testing. They have access to Kalshi and Polymarket (Philippines is not on either platform's blocked list), making them ideal for testing the full live trading pipeline in a non-US jurisdiction.

| Role | Responsibilities | Access Level |
|---|---|---|
| Lead QA Engineer | Coordinates test execution, tracks bug reports, signs off on each phase, manages test data | Full admin |
| API Tester | Tests all backend endpoints using Postman or curl, validates request/response schemas, stress tests | API + DB read |
| Frontend Tester | Tests all pages on multiple devices and browsers, documents UI bugs with screenshots | App user |
| Live Trading Tester | Executes paper and (small) live trades on Kalshi, validates platform router, tests approval flow | Kalshi account |
| Data Validator | Verifies AI probability scores, checks evidence records for quality, validates recommendation logic, confirms macro values match BLS/BEA sources | DB read access |
| Auth Tester | Validates registration, login, session expiry, role checks, password change, encrypted credential storage | App user |

### 2.2 Local Finance Students
Finance students test from the perspective of real end users who are learning to trade. They should have no prior briefing on how the app works — their confusion points are your UX bugs. Each student gets a fresh $10,000 paper trading account behind their own login.

| Group | Background | Testing Focus | Guidance |
|---|---|---|---|
| Beginner group (no trading exp) | General finance students | Onboarding, registration, paper trading intuition | No briefing — observe where they get stuck |
| Intermediate group (some trading) | Upper-year finance students | Scanner, AI Coach, recommendations, edge scoring | Brief intro to prediction markets only |
| Advanced group (trading exp) | Graduate students / finance majors | Full platform, historical data, signal quality critique | Full platform access, invite critique |

**Key Instruction for Finance Students:**
Paper trading means NO real money changes hands. The $10,000 balance is simulated. Clicking "Execute paper trade" does not connect to any broker or exchange. It is entirely contained within the ARCLION app.

### 2.3 Core Team (You)
- Validates Kalshi live trading integration with real account (small amounts — $10 test trades)
- Tests US jurisdiction mode — Polymarket correctly shows paper-only, Kalshi routes correctly
- Validates all risk controls: daily loss limit, position cap, approval gate
- Reviews AI recommendation quality and Coach commentary for accuracy and live-data citation
- Validates macro intelligence (BLS CPI/Unemployment, BEA GDP, Fed Funds Rate) flowing into Coach + recommendation prompts
- Validates auth admin role, encrypted-at-rest trading credentials
- Final sign-off authority for each phase

---

## 3. Phase 1 — Infrastructure & Setup Testing
*(Week 1)*

Before any feature testing, verify that every external service is correctly connected and the app starts cleanly. The Philippines team runs this phase entirely.

### 3.1 Environment Checklist

| Check | How to verify | Pass criterion | Tester |
|---|---|---|---|
| Replit app starts | Restart all 3 workflows, watch console | API server, alpha-lens, mockup-sandbox all reach READY, listen on assigned `PORT` | PH Lead |
| Health endpoint | `GET /api/healthz` | Returns `{"status": "ok"}` | PH API |
| PostgreSQL connected | `GET /api/markets` (after login) — check response | Returns `{"markets": [...], "total": N}` from DB, no connection errors | PH API |
| Anthropic AI proxy valid | `POST /api/markets/1/score` | Returns `{"market": {...}, "signals": [...], "scoring": {...}}`, no auth error | PH API |
| Market data with sector filter | `GET /api/markets?sector=crypto` | Only crypto-sector assets returned | PH Data |
| Market sort options work | `GET /api/markets?sort=price_change` then `?sort=name` then `?sort=alpha_score` | List re-sorts correctly for each option | PH API |
| Seed data loaded | `GET /api/markets` after running seed script | 12+ sample markets returned with prices and sectors | PH Lead |
| Frontend loads on all browsers | Visit app URL in Chrome, Firefox, Safari, Mobile (after login) | No blank screens, no console errors | PH Frontend |
| All nav pages load | `/` `/market/1` `/portfolio` `/coach` `/briefing` `/radar` `/whales` `/settings` | All 8 pages render without 404 or crash | PH Frontend |
| Login/Register pages public | Visit `/login` and `/register` while logged out | Both render, not redirected to login | PH Frontend |
| Seed data present | Run `cd artifacts/api-server && pnpm exec tsx src/seed.ts` | 12 sample market assets and 11 evidence signals created | PH Lead |
| API codegen up to date | `pnpm --filter @workspace/api-spec run codegen` | Codegen completes with no errors, generated files match spec | PH Lead |
| TypeScript typecheck passes | `pnpm --filter @workspace/api-server exec tsc --noEmit` | Zero type errors across all packages | PH Lead |

### 3.2 Scheduler Startup Verification

| Check | How to verify | Pass criterion | Tester |
|---|---|---|---|
| Scheduler starts on boot | Watch server console after Run | Console shows "Scheduler started: markets(5min) · recommendations(30min) · radar(5min)" | PH Lead |
| Initial market refresh fires | Watch console ~3 seconds after boot | Console shows "Running initial market data refresh..." followed by price update logs | PH Lead |
| Initial refresh completes | Check for "Market data refresh complete" log | Log shows `{updated: N, total: N}` with `updated > 0` | PH Lead |
| No crash on initial refresh failure | Start app with no internet connection | Console logs error "Scheduled market refresh failed", app stays running | PH API |

### 3.3 External Data Source Verification

| Check | How to verify | Pass criterion | Tester |
|---|---|---|---|
| CoinGecko API reachable | `GET /api/markets` — check crypto prices | BTC, ETH, SOL have non-null `currentPrice` with recent `updatedAt` | PH Data |
| Yahoo Finance API reachable | `GET /api/markets` — check stock/commodity prices | SPY, QQQ, GLD, USO, UNG, EURUSD have non-null `currentPrice` | PH Data |
| CoinGecko 24h change | Check crypto assets after market refresh | `priceChange24h` populated with realistic percentage (not null or 0) | PH Data |
| Yahoo price change calc | Check stock/commodity assets | `priceChange24h = ((currentPrice - previousClose) / previousClose) * 100`, rounded to 2 decimal places | PH Data |
| 10-second fetch timeout | Simulate slow network or block CoinGecko | Request aborts after 10s, logs warning, app continues without crash | PH API |
| Kalshi prediction prices reachable | `GET /api/radar/prediction-prices` (after login) | Returns `{"prices": {"FED-CUT": N, "BTC-100K": N, "RECESSION-2026": N, ...}}` with non-null Kalshi values, no API key required | PH API |
| BLS macro reachable (registered) | With `BLS_API_KEY` set, `GET /api/radar/macro/bls` | Returns `{"cpi": {...}, "unemployment": {...}, "asOf": "...", "source": "Bureau of Labor Statistics", "registered": true}` | PH API |
| BLS auto-fallback to unregistered | Set invalid `BLS_API_KEY`, hit `/api/radar/macro/bls` | Service detects 401/key-rejected and falls back to unregistered call (logs `blsKeyRejected=true`), still returns data | PH API |
| BEA GDP reachable | With `BEA_API_KEY` set, `GET /api/radar/macro/bea` | Returns `{"gdp": {...}, "source": "Bureau of Economic Analysis", "updatedAt": "..."}` with current quarter and prior-quarter values | PH API |
| BLS not configured → 503 | Remove `BLS_API_KEY`, hit `/api/radar/macro/bls` | Returns 503 `{"error": "BLS not configured — add BLS_API_KEY to Secrets"}` | PH API |
| BEA not configured → 503 | Remove `BEA_API_KEY`, hit `/api/radar/macro/bea` | Returns 503 `{"error": "BEA not configured — add BEA_API_KEY to Secrets"}` | PH API |

### 3.4 Trading Platform Integration Check (Philippines team — live account)

| Check | How to verify | Pass criterion |
|---|---|---|
| Trading accounts endpoint | `GET /api/trading/accounts` | Returns `{"accounts": {"usJurisdictionMode": true/false, "primaryPlatform": "...", "kalshi": {...}, "alpaca": {...}, "polymarket": {...}}}` |
| Kalshi status — configured | Set `KALSHI_EMAIL` and `KALSHI_PASSWORD` in Secrets, `GET /api/trading/accounts` | `accounts.kalshi.status = "configured"`, `legalStatus = "CFTC regulated — legal for US residents in all 50 states"`, `depositMethod = "USD wire / bank transfer"` |
| Kalshi status — not configured | Remove Kalshi Secrets, `GET /api/trading/accounts` | `accounts.kalshi.status = "not_configured"`, `message = "Add KALSHI_EMAIL and KALSHI_PASSWORD to Secrets"`, `priority = "PRIMARY — set this up first"` |
| Alpaca status — configured | Set `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`, check response | `accounts.alpaca.status = "configured"`, `assetTypes = "US stocks and ETFs"` |
| Alpaca status — not configured | Remove Alpaca Secrets, check response | `accounts.alpaca.status = "not_configured"`, `priority = "SECONDARY — for stock/ETF recommendations"` |
| Polymarket — US mode | Set `US_JURISDICTION_MODE=true`, check response | `accounts.polymarket.legalStatus = "PAPER TRADING ONLY (US jurisdiction mode ON)"` |
| Polymarket — non-US mode | Set `US_JURISDICTION_MODE=false`, check response | `accounts.polymarket.legalStatus = "Live trading enabled (non-US jurisdiction)"` or "Available" |
| US jurisdiction mode flag | Check `accounts.usJurisdictionMode` | Matches the `US_JURISDICTION_MODE` env var (defaults to `true`) |
| Platform router selects correctly | `GET /api/trading/route/{recommendation-id}` | Returns `{"recommendationId": N, "title": "...", "selectedPlatform": "...", "reason": "...", "tradeable": true/false, "usJurisdictionMode": ..., "requireApproval": ...}` |

### 3.5 Radar Data Source Verification

| Check | How to verify | Pass criterion | Tester |
|---|---|---|---|
| Radar status endpoint | `GET /api/radar/status` | Returns source list with 9 sources: `coingecko`, `yahoo_finance`, `unusual_whales`, `alpha_vantage`, `finnhub`, `benzinga`, `kalshi_markets`, `bls`, `bea` | PH API |
| CoinGecko always active | Check `sources.coingecko.status` | Always `"active"`, tier `"free"` | PH API |
| Yahoo Finance always active | Check `sources.yahoo_finance.status` | Always `"active"`, tier `"free"` | PH API |
| Kalshi markets always active | Check `sources.kalshi_markets.status` | Always `"active"`, tier `"free"`, note mentions Fed rate cut, recession, BTC $100K | PH API |
| Unusual Whales conditional | Check `sources.unusual_whales.status` | `"active"` if `UNUSUAL_WHALES_KEY` set, otherwise `"not_configured"` | PH API |
| Alpha Vantage conditional | Check `sources.alpha_vantage.status` | `"active"` if `ALPHA_VANTAGE_KEY` set, otherwise `"not_configured"` | PH API |
| Finnhub conditional | Check `sources.finnhub.status` | `"active"` if `FINNHUB_KEY` set, otherwise `"not_configured"` | PH API |
| Benzinga is planned | Check `sources.benzinga.status` | Always `"planned"`, tier `"paid"`, note mentions $150/mo subscription | PH API |
| BLS conditional | Check `sources.bls.status` and `sources.bls.tier` | `status = "active"`, `tier = "registered"` if `BLS_API_KEY` set; otherwise `"not_configured"`, `tier = "none"` | PH API |
| BEA conditional | Check `sources.bea.status` | `"active"` (free tier) if `BEA_API_KEY` set, otherwise `"not_configured"` | PH API |
| Assets monitored count | Check `assetsMonitored` | Returns 18 (number of assets in SPIKE_THRESHOLDS map) | PH API |
| Chain maps count | Check `chainMaps` | Returns 8 (number of assets with chain reaction definitions) | PH API |

**Phase 1 Exit Criteria:**
All environment checks pass with green status. Scheduler starts and fires initial refresh. External data sources return prices. Trading accounts endpoint returns valid platform statuses based on configured Secrets. Radar status shows at least 4 active sources (CoinGecko + Yahoo + Kalshi markets + at least one of BLS/BEA). Auth login returns valid session cookie. App loads on at least 3 different browsers with zero console errors. TypeScript typecheck passes with zero errors. Only then move to Phase 2.

---

## 4. Phase 2 — Functional Testing (Weeks 2–3)

Systematic testing of every feature. Each test case has a unique ID, steps, expected result, and a pass/fail column for the tester to fill in. All bugs get logged in a shared tracking sheet.

### 4.1 Authentication & Session Management
**Endpoints:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| AU-01 | Register new user | `POST /api/auth/register` with `{"email": "test@x.com", "password": "Pass1234!", "name": "Test"}` | Returns `{"user": {...}, "token": "..."}`, sets `auth_token` HTTP-only cookie, user row created | |
| AU-02 | Register duplicate email | Re-register same email | Returns 409 or 400 with descriptive error, no second row | |
| AU-03 | Register weak password | `POST /api/auth/register` with `{"password": "abc"}` | Returns 400 Zod validation error (min length / complexity) | |
| AU-04 | Register invalid email | `POST /api/auth/register` with `{"email": "notanemail"}` | Returns 400 Zod validation error | |
| AU-05 | Login success | `POST /api/auth/login` with valid creds | Returns `{"user": {id, email, name, role}, "token"}`, sets cookie, updates `lastLoginAt` | |
| AU-06 | Login wrong password | `POST /api/auth/login` with bad password | Returns 401 `{"error": "Invalid email or password"}` (generic, no user enumeration) | |
| AU-07 | Login unknown email | `POST /api/auth/login` with non-existent email | Returns 401 `{"error": "Invalid email or password"}` (same message as AU-06) | |
| AU-08 | Login deactivated user | Set `isActive=false` in DB, attempt login | Returns 401 (account treated as not-found) | |
| AU-09 | Email case-insensitive | Login with email in different case (e.g., `JAMES.VILLAR@…`) | Login succeeds (email lower-cased before lookup) | |
| AU-10 | Get current user | `GET /api/auth/me` with valid cookie | Returns current user `{id, email, name, role}` | |
| AU-11 | Get user without auth | `GET /api/auth/me` without cookie | Returns 401 unauthorized | |
| AU-12 | Logout clears cookie | `POST /api/auth/logout` | Returns `{"message": "Logged out"}`, clears `auth_token` cookie | |
| AU-13 | After logout, /me fails | After AU-12, `GET /api/auth/me` | Returns 401 | |
| AU-14 | Change password success | `POST /api/auth/change-password` with `{currentPassword, newPassword}` | Password hash updated, returns success | |
| AU-15 | Change password wrong current | Submit with bad current password | Returns 401/403 with descriptive error | |
| AU-16 | All protected routes need auth | Hit `/api/markets`, `/api/portfolio`, `/api/coach/analyze`, `/api/recommendations/briefing`, `/api/trading/accounts`, `/api/radar/alerts`, `/api/whales/status`, `/api/user/trading-accounts` without cookie | Each returns 401 | |
| AU-17 | Token in Authorization header | Send `Authorization: Bearer <token>` instead of cookie | Authentication still works (middleware accepts both) | |
| AU-18 | Admin role on bootstrap user | Login as `james.villar@arclion.ai`, check `/api/auth/me` | `role = "admin"` | |
| AU-19 | JWT signed with SESSION_SECRET | Tamper with token payload | Returns 401 (signature invalid) | |
| AU-20 | Password hashed with bcrypt | Inspect `users.password_hash` in DB | Starts with `$2a$` or `$2b$` (bcrypt), not plaintext | |
| AU-21 | Login page renders | Visit `/login` while logged out | Renders email + password fields, submit button, link to `/register` | |
| AU-22 | Register page renders | Visit `/register` while logged out | Renders name + email + password fields, submit, link to `/login` | |
| AU-23 | Auth redirect | Visit `/portfolio` while logged out | Redirected to `/login` | |
| AU-24 | Logged-in redirect | Visit `/login` while logged in | Redirected to `/` (scanner) | |
| AU-25 | Session persists across reload | Login, refresh page | Still logged in, cookie persists | |

### 4.2 User Trading Credentials (Encrypted)
**Endpoints:** `GET /api/user/trading-accounts`, `POST /api/user/trading-accounts`, `DELETE /api/user/trading-accounts/:platform`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| UC-01 | List own credentials | `GET /api/user/trading-accounts` | Returns `{"accounts": [...]}` for the current user only | |
| UC-02 | Save Kalshi credentials | `POST /api/user/trading-accounts` with `{"platform": "kalshi", "credentials": {"email": "...", "password": "..."}}` | Returns success, row stored in DB | |
| UC-03 | Credentials encrypted at rest | Inspect DB row directly | Stored as opaque encrypted blob using `CREDENTIALS_ENCRYPTION_KEY`, never plaintext | |
| UC-04 | Save Alpaca credentials | `POST /api/user/trading-accounts` with `{"platform": "alpaca", "credentials": {"apiKey": "...", "secretKey": "..."}}` | Returns success, encrypted blob stored | |
| UC-05 | Update existing credentials | POST again for same platform | Replaces previous credentials for that user/platform | |
| UC-06 | Delete credentials | `DELETE /api/user/trading-accounts/kalshi` | Returns success, row removed | |
| UC-07 | Cross-user isolation | Login as user A, save creds; login as user B, list | User B sees only their own accounts (none of A's) | |
| UC-08 | Decrypt round-trip | Save creds, retrieve, attempt to decrypt | Decryption with `CREDENTIALS_ENCRYPTION_KEY` returns the original credentials object | |
| UC-09 | Settings page CRUD | Visit `/settings`, add/remove credentials in UI | UI calls match endpoints, success toasts shown | |
| UC-10 | API does NOT return raw secrets | `GET /api/user/trading-accounts` response | Never returns plaintext password/secret keys to client | |

### 4.3 Market Scanner (Homepage `/`)
**Endpoint:** `GET /api/markets`
**Query params:** `sector` (enum: energy, metals, agriculture, crypto, equities, fx, real_estate, prediction), `sort` (enum: alpha_score, price_change, name — default: alpha_score), `limit` (number — default: 50)

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| SC-01 | Markets load on open | Navigate to `/` (homepage) | Markets list appears within 3 seconds, shows `markets` array and `total` count | |
| SC-02 | Sector filter — energy | `GET /api/markets?sector=energy` | Only energy-sector assets returned | |
| SC-03 | Sector filter — crypto | `GET /api/markets?sector=crypto` | Only crypto-sector assets returned | |
| SC-04 | Sector filter — prediction | `GET /api/markets?sector=prediction` | Only prediction market assets returned (FED-CUT, BTC-100K, RECESSION-2026, etc.) | |
| SC-05 | Sort by alpha score (default) | `GET /api/markets` or `?sort=alpha_score` | Markets ordered by `alphaScore` descending | |
| SC-06 | Sort by price change | `GET /api/markets?sort=price_change` | Markets ordered by `priceChange24h` descending | |
| SC-07 | Sort by name | `GET /api/markets?sort=name` | Markets ordered alphabetically ascending | |
| SC-08 | Limit parameter | `GET /api/markets?limit=5` | Exactly 5 markets returned (or fewer if fewer exist) | |
| SC-09 | Edge badge colors | Find markets with positive and negative edge | Green badge for + edge, red for negative, gray for near-zero | |
| SC-10 | Detail navigation | Click any market row | Asset detail page loads for correct market | |
| SC-11 | Market fields complete | Check any market object | Contains: `id`, `name`, `symbol`, `sector`, `currentPrice`, `priceChange24h`, `alphaScore`, `aiProbability`, `marketProbability`, `edge`, `direction`, `lastScoredAt`, `aiSummary`, `tradingBloc`, `riskLevel`, `region`, `updatedAt` | |
| SC-12 | Direction values | Check market `direction` field | Only returns `"bullish"`, `"bearish"`, `"neutral"`, or `null` | |
| SC-13 | Risk level values | Check market `riskLevel` field | Only returns `"low"`, `"medium"`, `"high"`, `"extreme"`, or `null` | |
| SC-14 | Mobile layout | Open scanner on smartphone | No horizontal scroll, text readable, buttons tappable | |
| SC-15 | Scanner requires auth | `GET /api/markets` without cookie | Returns 401 | |

### 4.4 Asset Detail & AI Scoring
**Endpoints:** `GET /api/markets/:id`, `POST /api/markets/:id/score`, `POST /api/markets/refresh`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| AD-01 | Market detail loads | `GET /api/markets/1` | Returns `{"market": {...}, "signals": [...], "relatedMarkets": [...]}` | |
| AD-02 | Related markets shown | Check `relatedMarkets` in detail response | Returns markets from the same `sector`, excluding the current market | |
| AD-03 | Signals attached | Check `signals` array in detail response | Returns up to 20 signals ordered by `createdAt` descending | |
| AD-04 | Signal fields complete | Check any signal object | Contains: `id`, `assetId`, `type`, `source`, `headline`, `detail`, `impact`, `direction`, `confidence`, `createdAt` | |
| AD-05 | Signal type values | Check signal `type` field | Only: `"geopolitical"`, `"economic"`, `"technical"`, `"sentiment"`, `"fundamental"`, `"alternative"` | |
| AD-06 | Signal impact values | Check signal `impact` field | Only: `"high"`, `"medium"`, `"low"` | |
| AD-07 | Signal direction values | Check signal `direction` field | Only: `"bullish"`, `"bearish"`, `"neutral"` | |
| AD-08 | Score a market | `POST /api/markets/1/score` | Returns updated market with `aiProbability` (0–100), `edge`, `alphaScore`, `direction`, `riskLevel`, `aiSummary`, `lastScoredAt` | |
| AD-09 | Scoring creates signals | `GET /api/signals/1` after scoring | 3–6 new signals created by AI with valid `type`, `source`, `headline`, `impact`, `direction`, `confidence` | |
| AD-10 | Re-score same market | `POST /api/markets/1/score` again | Values update, new signals generated (not duplicating old ones) | |
| AD-11 | Score different market | `POST /api/markets/2/score` | Different probability and edge values than market 1 | |
| AD-12 | Direction colors on frontend | Open scored market on frontend | Bullish = green indicators, bearish = red, neutral = gray/neutral | |
| AD-13 | Probability gauge renders | Open any scored market on frontend | Gauge needle at correct position, color matches direction | |
| AD-14 | Edge calculation | Score a market, check math | `edge = aiProbability − marketProbability` (rounded to 1 decimal) | |
| AD-15 | Alpha score formula | Check scored market `alphaScore` | `alphaScore = |edge| × confidenceWeight` per `scoring.ts` formula | |
| AD-16 | Risk level thresholds | Score multiple markets, check `riskLevel` | `"extreme"` if `|edge| > 30`, `"high"` if > 15, `"medium"` if > 5, else `"low"` | |
| AD-17 | AI scoring fallback | Block Anthropic proxy (temporarily), `POST /api/markets/1/score` | Returns a result (not 500): `confidence: 0.3`, fallback probability ≈ 50 ± 10, reasoning starts with "Fallback scoring applied" | |
| AD-18 | Fallback direction logic | Check fallback result direction | `"bullish"` if fallback edge > 0, `"bearish"` if < 0, `"neutral"` if = 0 | |

### 4.5 Market Data Refresh Service
Tested via `POST /api/markets/refresh` and scheduler (every 5 minutes)

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| MD-01 | CoinGecko crypto mapping | Refresh, check BTC/ETH/SOL prices | BTC → CoinGecko `bitcoin`, ETH → `ethereum`, SOL → `solana` — all have fresh prices | |
| MD-02 | Yahoo Finance stock mapping | Refresh, check SPY/QQQ/GLD/USO/UNG/EURUSD prices | SPY → Yahoo `SPY`, QQQ → `QQQ`, GLD → `GLD`, USO → `USO`, UNG → `UNG`, EURUSD → `EURUSD=X` — all have fresh prices | |
| MD-03 | 24h change — crypto | Check `priceChange24h` on a crypto asset | Value from CoinGecko `usd_24h_change`, rounded to 2 decimal places | |
| MD-04 | 24h change — stocks | Check `priceChange24h` on a stock asset | Calculated as `((currentPrice - previousClose) / previousClose) * 100`, rounded to 2 decimal places | |
| MD-05 | `updatedAt` timestamp | Check any updated asset | `updatedAt` is current timestamp (within last minute) | |
| MD-06 | Only mapped assets update | Add an asset with unmapped symbol to DB | That asset is NOT updated by refresh (no price data available) | |
| MD-07 | Parallel fetching | Monitor refresh timing | CoinGecko and Yahoo fetches run in parallel (`Promise.all`), not sequentially | |
| MD-08 | CoinGecko failure isolation | Block CoinGecko, refresh | Crypto prices stay stale, but stock/commodity prices still update — no crash | |
| MD-09 | Yahoo failure isolation | Block Yahoo Finance, refresh | Stock prices stay stale, but crypto prices still update — no crash | |
| MD-10 | Yahoo per-ticker isolation | One Yahoo ticker fails (e.g., UNG) | Other tickers (SPY, QQQ, etc.) still update — `Promise.allSettled` handles individual failures | |
| MD-11 | 10-second timeout | Simulate slow external API | Request aborts after 10 seconds, logs warning, continues to next source | |
| MD-12 | Refresh return count | `POST /api/markets/refresh` | `refreshed` count = number of assets that had matching price data | |

### 4.6 Evidence Signals
**Endpoints:** `GET /api/signals/:assetId`, `GET /api/signals/feed/latest`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| SG-01 | Get signals for asset | `GET /api/signals/1` | Returns `{"signals": [...], "total": N}` for asset ID 1 | |
| SG-02 | Signals limit param | `GET /api/signals/1?limit=5` | Returns at most 5 signals | |
| SG-03 | Default limit is 20 | `GET /api/signals/1` (no limit) | Returns at most 20 signals | |
| SG-04 | Signals sorted by date | Check signal order | Sorted by `createdAt` descending (newest first) | |
| SG-05 | Latest feed | `GET /api/signals/feed/latest` | Returns up to 20 most recent signals across ALL assets | |
| SG-06 | Empty signals | `GET /api/signals/99999` | Returns `{"signals": [], "total": 0}` | |

### 4.7 Daily Briefing & Recommendations
**Endpoints:** `GET /api/recommendations/briefing`, `POST /api/recommendations/scan`, `GET /api/recommendations/recommendations`, `GET /api/recommendations/events`, `GET /api/recommendations/watchlist`, `POST /api/recommendations/watchlist`, `DELETE /api/recommendations/watchlist/:id`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| BR-01 | Briefing page loads — no data | `GET /api/recommendations/briefing` before any scan | Returns fallback: `{"summary": "No briefing available yet...", "recommendations": [], "globalEvents": [], "tradeCount": 0, "watchCount": 0, "signalsProcessed": 0, "scanNumber": 0}` | |
| BR-02 | Trigger scan | `POST /api/recommendations/scan` | Returns `{"status": "scan_started", "message": "Scanning global markets..."}` immediately (scan runs in background) | |
| BR-03 | Briefing after scan | `GET /api/recommendations/briefing` after scan completes (~3 min) | Returns briefing with `id`, `summary`, `tradeCount`, `watchCount`, `signalsProcessed`, `scanNumber`, `generatedAt`, `recommendations` array, `globalEvents` array | |
| BR-04 | Recommendation fields | Check any recommendation object | Contains: `id`, `briefingId`, `type` (trade/watch/avoid), `urgency` (high/medium/low), `title`, `assetId`, `assetTitle`, `assetClass`, `sector`, `region`, `direction`, `aiProbability`, `marketPrice`, `edge`, `headline`, `why` (array), `historicalContext`, `bearCase`, `entryTrigger`, `confidence`, `window`, `urgencyReason`, `createdAt` | |
| BR-05 | List recommendations with filters | `GET /api/recommendations/recommendations?type=trade&urgency=high` | Returns only trade-type, high-urgency recommendations | |
| BR-06 | List recommendations limit | `GET /api/recommendations/recommendations?limit=5` | Returns at most 5 recommendations, max cap 100 | |
| BR-07 | Recommendations sorted by confidence | `GET /api/recommendations/recommendations` | Sorted by `confidence` descending | |
| BR-08 | Global events | `GET /api/recommendations/events` | Returns `{"events": [...]}` with `id`, `title`, `region`, `impactLevel`, `detail`, `affectedAssets`, `direction`, `timeContext`, `scannedAt` | |
| BR-09 | Events limit | `GET /api/recommendations/events?limit=5` | Returns at most 5 events, max cap 50 | |
| BR-10 | Global event impact levels | Check event `impactLevel` field | Only: `"critical"`, `"high"`, `"medium"`, `"low"` | |
| BR-11 | Global event direction | Check event `direction` field | Only: `"bullish"`, `"bearish"`, `"mixed"` | |
| BR-12 | Get watchlist | `GET /api/recommendations/watchlist` | Returns `{"watchlist": [...]}` sorted by `addedAt` descending | |
| BR-13 | Add to watchlist | `POST /api/recommendations/watchlist` with `{"assetId": 1, "assetTitle": "Bitcoin", "assetClass": "crypto", "alertEdgeThreshold": 5.0, "notes": "test"}` | Returns `{"status": "added", "item": {...}}` | |
| BR-14 | Watchlist default threshold | `POST /api/recommendations/watchlist` with only `{"assetId": 1}` | Item created with `alertEdgeThreshold: 5.0` default | |
| BR-15 | Remove from watchlist | `DELETE /api/recommendations/watchlist/{id}` | Returns `{"status": "removed"}` | |
| BR-16 | TRADE vs WATCH vs AVOID labels | Look at recommendation cards on frontend | Different visual treatment for type `"trade"`, `"watch"`, `"avoid"` | |
| BR-17 | Asset title rendered under main title | Open `/briefing`, inspect any rec card | Below the main strategic-call title, a small muted mono label shows `rec.assetTitle` (the asset name) — must be visible, not blank | |

### 4.8 Recommendations Scan Service (Internal Logic)
These tests validate the AI scan pipeline internals — not just the API response, but the quality and correctness of the data flowing through the system.

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| RS-01 | Scan reads top 30 assets | Trigger scan, check console/DB | Scan queries up to 30 assets ordered by `currentPrice` descending | |
| RS-02 | Scan reads latest 50 signals | Trigger scan, check console | Scan queries up to 50 signals ordered by `createdAt` descending | |
| RS-03 | Global events scanned first | Trigger scan, watch console | Events scan runs before recommendation generation (events feed into recommendations) | |
| RS-04 | Max 3 TRADE calls per briefing | Trigger multiple scans, check `tradeCount` | Never exceeds 3 TRADE type recommendations per briefing | |
| RS-05 | Max 8 WATCH calls per briefing | Check recommendations per briefing | WATCH type count never exceeds 8 | |
| RS-06 | Scan number increments | Run 3 scans, check `scanNumber` each time | Each briefing gets incrementing `scanNumber` (e.g., 614, 615, 616) | |
| RS-07 | Briefing summary generated | Check `summary` field after scan | 3–4 sentence executive summary referencing specific assets and edge sizes | |
| RS-08 | Empty summary fallback | Scan when AI returns no recommendations | Summary = `"No significant opportunities identified in this scan. Markets appear fairly priced."` | |
| RS-09 | Single-rec summary fallback | Block summary AI call but recs succeed | Summary = `"Today's scan identified N opportunities. Top call: [title] at [confidence]% confidence."` | |
| RS-10 | Events have required fields | Check events after scan in DB | Each event has `title`, `region`, `impactLevel`, `detail`, `affectedAssets` (array), `direction`, `timeContext` | |
| RS-11 | Events region values | Check event `region` values | Only: `"Middle East"`, `"Asia-Pacific"`, `"Europe"`, `"Americas"`, `"Africa"`, `"Global"` | |
| RS-12 | Recommendations linked to briefing | Check recommendations after scan | Every recommendation has `briefingId` matching the parent briefing id | |
| RS-13 | JSON extraction handles markdown fences | Verify scan works when AI wraps response in ` ```json ` | Recommendations parse correctly (service strips markdown fences) | |
| RS-14 | Scan failure doesn't crash server | Block Anthropic proxy, trigger scan | Console logs error, server continues running, next scan works when proxy restored | |
| RS-15 | Asset matching populates fields | Check recommendation `edge`/`aiProbability`/`marketPrice` after scan | Values match by name/symbol lookup against fetched assets; fallback to 0 (never null) | |
| RS-16 | MACRO CONTEXT injected into prompt | Inspect Claude prompt logs during a scan | Prompt includes `MACRO CONTEXT` block with Fed Funds Rate, CPI, Unemployment, GDP, and Kalshi prediction probabilities (built by `fetchMacroContext()` over Promise.allSettled) | |
| RS-17 | Macro references appear in summary | After scan, check briefing `summary` and recommendation `why[]` arrays | Summary or recs reference at least one of: GDP, CPI, inflation, unemployment, Fed funds, recession (per recent traces — GDP 10×, recession 4× per scan #614) | |
| RS-18 | Macro fetch failure doesn't break scan | Disable BLS + BEA + Fed funds source, trigger scan | Scan still completes (Promise.allSettled), MACRO CONTEXT shows whichever sources succeeded or empty block, no crash | |

### 4.9 Paper Trading & Portfolio
**Endpoints:** `GET /api/portfolio`, `POST /api/portfolio/trade`, `POST /api/portfolio/trade/:id/close`, `GET /api/portfolio/stats`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| PT-01 | Portfolio initializes | `GET /api/portfolio` (first call) | Creates portfolio with `balance: 10000`, `initialBalance: 10000`, empty `openTrades` and `closedTrades` | |
| PT-02 | Open long trade | `POST /api/portfolio/trade` with `{"assetId": 1, "direction": "long", "amount": 200}` | Returns `{"trade": {...}, "balance": 9800, "message": "Opened long position on [name] for $200.00"}` | |
| PT-03 | Open short trade | `POST /api/portfolio/trade` with `{"assetId": 1, "direction": "short", "amount": 100}` | Returns trade with `direction: "short"` | |
| PT-04 | Trade direction validation | `POST /api/portfolio/trade` with `{"direction": "invalid"}` | Zod validation error (direction must be "long" or "short") | |
| PT-05 | Insufficient balance | `POST /api/portfolio/trade` with `amount > current balance` | Returns `{"error": "Insufficient balance"}` with 400 status | |
| PT-06 | Invalid asset | `POST /api/portfolio/trade` with `{"assetId": 99999, ...}` | Returns `{"error": "Asset not found"}` with 404 status | |
| PT-07 | Portfolio shows open trade | `GET /api/portfolio` after opening trade | `openTrades` array contains the trade with correct `assetId`, `assetName`, `assetSymbol`, `direction`, `entryPrice`, `quantity`, `status: "open"` | |
| PT-08 | Trade quantity calculation | Check trade `quantity` field | Equals `amount / currentPrice` (or `amount` if price is 0) | |
| PT-09 | Close position | `POST /api/portfolio/trade/{trade-id}/close` | Returns `{"trade": {...}, "balance": N, "message": "Closed [direction] on [name]. PnL: $X.XX"}` | |
| PT-10 | Closed trade has PnL | Check closed trade object | `exitPrice`, `pnl`, `pnlPercent`, `closedAt` all populated | |
| PT-11 | Long PnL calculation | Close a long trade after price change | `PnL = (exitPrice - entryPrice) × quantity` | |
| PT-12 | Short PnL calculation | Close a short trade after price change | `PnL = -(exitPrice - entryPrice) × quantity` | |
| PT-13 | Close already-closed trade | `POST /api/portfolio/trade/{id}/close` on closed trade | Returns `{"error": "Trade already closed"}` with 400 status | |
| PT-14 | Close nonexistent trade | `POST /api/portfolio/trade/99999/close` | Returns `{"error": "Trade not found"}` with 404 status | |
| PT-15 | Balance updates after close | Check balance after closing trade | Balance = previous balance + (entryPrice × quantity + pnl) | |
| PT-16 | Portfolio stats | `GET /api/portfolio/stats` | Returns `{"totalTrades", "winRate", "avgReturn", "bestTrade", "worstTrade", "sharpeRatio": null, "balance", "totalPnl"}` | |
| PT-17 | Win rate calculation | Close 5+ trades with mixed results | `winRate = (winners / closedTrades) × 100` | |
| PT-18 | Best/worst trade | Check stats after multiple trades | `bestTrade` = highest PnL, `worstTrade` = lowest PnL among closed trades | |
| PT-19 | Trade fields complete | Check any trade object | Contains: `id`, `assetId`, `assetName`, `assetSymbol`, `direction`, `entryPrice`, `exitPrice`, `quantity`, `pnl`, `pnlPercent`, `status`, `aiReasoning`, `openedAt`, `closedAt` | |
| PT-20 | Paper trade on mobile | Complete PT-02 through PT-09 on a smartphone | All steps work, UI is usable on small screen | |
| PT-21 | Per-user portfolio isolation | User A opens trade; user B logs in, `GET /api/portfolio` | User B sees their own portfolio (separate balance/trades), not user A's | |

### 4.10 AI Coach (Live-Data Edition)
**Endpoint:** `POST /api/coach/analyze`
**Body:** `{"assetId": number (optional), "question": string, "context": string (optional)}`
**Response:** `{"analysis": string, "recommendations": string[], "riskAssessment": string (optional), "confidence": number}`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| LC-01 | Coach with asset context | `POST /api/coach/analyze` with `{"assetId": 1, "question": "Should I buy this?"}` | Returns `{"analysis", "recommendations", "riskAssessment", "confidence"}` within 60s | |
| LC-02 | Coach without asset | `POST /api/coach/analyze` with `{"question": "What markets look good right now?"}` | Returns analysis citing specific assets by name, current prices, and edge values from the live snapshot — NOT generic advice | |
| LC-03 | Coach with extra context | Send with `{"context": "I'm a beginner"}` | Analysis accounts for the provided context | |
| LC-04 | Coach recommendations array | Check response `recommendations` field | Returns array of actionable string recommendations (max 5 items, parsed from bullet points in analysis) | |
| LC-05 | Coach confidence score | Check response `confidence` field | Returns `0.75` on successful AI response | |
| LC-06 | Coach error handling | `POST /api/coach/analyze` with empty body | Returns Zod validation error (`question` is required) | |
| LC-07 | Coach uses Claude | Verify server console during request | Anthropic AI proxy called via Replit integrations with model `claude-sonnet-4-6`, `max_tokens: 1000` | |
| LC-08 | Coach on frontend | Navigate to `/coach`, ask a question | Response renders within 60s, specific to the question asked | |
| LC-09 | Coach fallback on AI failure | Block Anthropic proxy, send coach request | Returns fallback: `confidence: 0.3`, `riskAssessment: "Unable to assess — AI service temporarily unavailable"`, `recommendations` = 3 hardcoded tips, `analysis` starts with "I'm having trouble connecting to the AI service right now..." | |
| LC-10 | Coach recommendation parsing | Ask question that produces numbered/bulleted list | Only lines starting with `- `, `• `, or `1. ` are parsed into `recommendations`, prefixes stripped | |
| LC-11 | Coach system prompt role | Ask "what are you?" or "who are you?" | Response reflects trading coach persona: direct, data-driven, balanced (matches `COACH_PROMPT`) | |
| LC-12 | Context appended to prompt | Send with `context: "I have $5000 budget"` | The context appears in the analysis (AI receives it as part of the user message) | |
| LC-13 | LIVE MARKET DATA injected | Inspect server logs / send "what data do you see?" | Prompt includes `LIVE MARKET DATA (as of <ISO>)` block listing top assets with `price`, `AI %`, `vs market %`, `edge`, `direction` | |
| LC-14 | Top 5 by alphaScore | Check the snapshot block contents | First 5 rows are top assets ordered by `alphaScore DESC NULLS LAST` (e.g., FED-CUT, GLD, SOL, EURUSD, ETH) | |
| LC-15 | Question-mentioned assets always present | Ask "how is BTC doing?" | Snapshot includes BTC with current price even though BTC isn't in the top 5 by alpha score (symbol/name match injects it) | |
| LC-16 | Briefing summary line injected | Inspect prompt with a recent briefing in DB | Prompt contains `Latest briefing: <100-char excerpt>…` from most recent `daily_briefings` row | |
| LC-17 | Macro context injected | Inspect prompt | Prompt includes `MACRO CONTEXT` block with Fed funds rate, CPI, Unemployment, GDP, Kalshi prediction probabilities (via `fetchMacroContext()`) | |
| LC-18 | Asset-specific context still works | `POST` with `{"assetId": 1, "question": "..."}` | Prompt also includes asset name, current price, AI/market probs, edge, direction, sector, region, AI summary, and recent signals for that asset | |
| LC-19 | Prompt order | Inspect final prompt sent to Claude | Order: `--- LIVE DATA AVAILABLE ---` block (market snapshot → briefing → asset-specific → macro), then `User question: <input>` | |
| LC-20 | System prompt forbids "no data" disclaimer | Ask any market-data question | Response does NOT say "I don't have access to real-time data" / "check Coinbase or CoinGecko"; it quotes specific live numbers | |
| LC-21 | Response cites Fed funds rate | Ask "what is the current Fed funds rate?" | Response quotes the live rate (e.g., "3.64% effective, target range 3.50–3.75%") | |
| LC-22 | Response cites BTC price | Ask "how is BTC doing?" | Response quotes the live BTC price (e.g., "$77,xxx") | |
| LC-23 | Response cites top edge opportunity | Ask "what markets look good right now?" | Response cites the top alpha-score asset (e.g., FED-CUT @ $48 with +32 pt edge, AI 74% vs market 48%) | |
| LC-24 | Macro fetch failure safe | Disable BLS/BEA/Fed source, send coach request | Coach still responds; missing macro lines are simply omitted, no crash | |
| LC-25 | Empty DB safe | Truncate assets table, send coach request | Snapshot block is empty but coach still responds (other context paths still inject) | |
| LC-26 | Per-request data isolation | Two different users send the same question | Each receives its own response; no cross-user state leakage | |

### 4.11 Live Trading & Risk Controls (E7)
**Endpoints:** `GET /api/trading/accounts`, `GET /api/trading/route/:recommendationId`, `POST /api/trading/execute`, `GET /api/trading/pending`, `POST /api/trading/pending/:id/approve`, `POST /api/trading/pending/:id/reject`, `GET /api/trading/history`, `GET /api/trading/positions`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| KL-01 | Accounts status | `GET /api/trading/accounts` | Returns `{"accounts": {"usJurisdictionMode": bool, "primaryPlatform": "kalshi", "note": "...", "kalshi": {...}, "alpaca": {...}, "polymarket": {...}}}` | |
| KL-02 | Kalshi sub-object | Check `accounts.kalshi` | Contains `status`, `legalStatus`, `depositMethod` (when configured) or `status`, `message`, `priority`, `legalStatus` (when not) | |
| KL-03 | Alpaca sub-object | Check `accounts.alpaca` | Contains `status`, `legalStatus`, `assetTypes` (when configured) or `status`, `message`, `priority` (when not) | |
| KL-04 | Polymarket sub-object | Check `accounts.polymarket` | Contains `status`, `legalStatus`, restricted in US mode | |
| KL-05 | Route a recommendation | `GET /api/trading/route/{rec-id}` | Returns `{"recommendationId": N, "title": "...", "selectedPlatform": "...", "reason": "...", "tradeable": bool, "usJurisdictionMode": bool, "requireApproval": bool}` | |
| KL-06 | Route 404 | `GET /api/trading/route/99999` | Returns `{"error": "Recommendation not found"}` with 404 status | |
| KL-07 | Execute trade — risk blocked (low edge) | `POST /api/trading/execute` with rec that has edge < `MIN_EDGE` (default 5) | Returns `{"success": false, "error": "Risk gate blocked: Edge X.X pts below minimum 5 pts"}` | |
| KL-08 | Execute trade — pending approval | `POST /api/trading/execute` with `{"recommendationId": N, "amountUsd": 50, "overrideApproval": false}` when `REQUIRE_APPROVAL=true` | Returns `{"success": false, "error": "Order queued for your approval...", "status": "pending_approval"}` | |
| KL-09 | Execute trade — paper fallback | `POST /api/trading/execute` with `{"recommendationId": N, "amountUsd": 50, "overrideApproval": true}` | Returns `{"success": true, "platform": "paper", "message": "Paper trade executed: $50 on [title]", "reason": "..."}` | |
| KL-10 | Pending orders list | `GET /api/trading/pending` | Returns `{"pending": [...]}` with orders that have `status: "pending_approval"`, sorted by `createdAt` descending | |
| KL-11 | Approve pending order | `POST /api/trading/pending/{id}/approve` | Returns `{"status": "approved", "orderId": N}`, order status changes in DB | |
| KL-12 | Approve logs live trade | After KL-11, `GET /api/trading/history` | Approved order appears as a live trade in history | |
| KL-13 | Approve already-processed | `POST /api/trading/pending/{id}/approve` on already-approved order | Returns `{"status": "approved", "orderId": N, "message": "Order already approved"}` | |
| KL-14 | Approve 404 | `POST /api/trading/pending/99999/approve` | Returns `{"error": "Pending order not found"}` with 404 status | |
| KL-15 | Reject pending order | `POST /api/trading/pending/{id}/reject` | Returns `{"status": "rejected", "orderId": N}` | |
| KL-16 | Trade history | `GET /api/trading/history` | Returns `{"trades": [...]}` sorted by `executedAt` descending | |
| KL-17 | History limit | `GET /api/trading/history?limit=5` | Returns at most 5 trades, max cap 100 | |
| KL-18 | History platform filter | `GET /api/trading/history?platform=paper` | Returns only paper-platform trades | |
| KL-19 | Trade history fields | Check any trade in history | Contains: `id`, `recommendationId`, `platform`, `assetId`, `assetTitle`, `direction`, `amountUsd`, `price`, `size`, `status`, `paperMode`, `aiProbability`, `aiEdge`, `confidence`, `orderId`, `ticker`, `executedAt` | |
| KL-20 | Open positions | `GET /api/trading/positions` | Returns `{"positions": [...]}` with trades that have `status: "filled"` | |
| KL-21 | Risk gate — daily trade limit | Execute enough trades to exceed `MAX_DAILY_TRADES` (default 10) | Trade blocked: "Daily trade limit (10) reached" | |
| KL-22 | $10 live test trade (Core team) | Place smallest possible real trade through approval flow | Confirms platform integration end-to-end | |

### 4.12 Risk Gate Deep Testing
These tests verify every risk check in the `checkRiskGate()` function.

**Risk Config Defaults:** `MIN_EDGE=5`, `MIN_CONFIDENCE=65`, `MAX_POSITION_PCT=0.05` (5%), `MAX_DAILY_TRADES=10`, `DAILY_LOSS_LIMIT_PCT=0.10` (10%), `REQUIRE_APPROVAL=true`, `US_JURISDICTION_MODE=true`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| RG-01 | Minimum edge gate | Execute trade on rec with edge = 3 (below default 5) | Blocked: "Edge 3.0 pts below minimum 5 pts" | |
| RG-02 | Edge gate passes | Execute trade on rec with edge = 8 | Edge check passes (may still fail other checks) | |
| RG-03 | Edge uses absolute value | Execute trade on rec with edge = -7 | `|edge|` = 7 passes the 5-pt minimum | |
| RG-04 | Minimum confidence gate | Execute trade on rec with confidence = 50 (below default 65) | Blocked: "Confidence 50% below minimum 65%" | |
| RG-05 | Confidence gate passes | Execute trade on rec with confidence = 80 | Confidence check passes | |
| RG-06 | Max position size gate | Execute trade with `amountUsd = $600` when portfolio = $10,000 | Blocked: "$600 exceeds max position $500 (5% of portfolio)" | |
| RG-07 | Position size passes | Execute trade with `amountUsd = $400` when portfolio = $10,000 | Position check passes ($400 < $500 max) | |
| RG-08 | Position check skipped if portfolio = 0 | Execute when portfolio value = 0 | Position check skipped (division by zero guard) | |
| RG-09 | Daily loss limit gate | After losing $1,100+ on a $10,000 portfolio | Blocked: "Daily loss limit reached — trading paused" (default 10% = $1,000 loss threshold) | |
| RG-10 | Daily loss check skipped if portfolio = 0 | Execute when portfolio value = 0 | Loss limit check skipped | |
| RG-11 | Daily trade count limit | Execute 11th trade in same calendar day | Blocked: "Daily trade limit (10) reached" | |
| RG-12 | Daily count resets at midnight | Execute trades, wait past midnight UTC, execute again | Count resets — trades allowed again | |
| RG-13 | All checks pass message | Execute when all checks pass | `reason: "All risk checks passed"` | |
| RG-14 | Custom env overrides | Set `MIN_EDGE=10` in Secrets, restart server | Edge gate now requires 10 pts instead of 5 | |
| RG-15 | Approval gate toggle | Set `REQUIRE_APPROVAL=false`, execute trade | Trade executes immediately without pending approval step | |
| RG-16 | Approval gate default | No `REQUIRE_APPROVAL` env var set | Defaults to `true` — all trades require approval | |

### 4.13 Platform Router Deep Testing
These tests verify the keyword-based platform routing logic in `getBestPlatform()`.

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| PR-01 | Stock/ETF → Alpaca | Create rec with `assetClass: "stock"` or `sector: "equity"`, Alpaca configured | Routes to `"alpaca"`, reason mentions "Stock/ETF market → Alpaca" | |
| PR-02 | Stock → paper if Alpaca missing | Same rec, Alpaca not configured | Routes to `"paper"`, reason: "Alpaca not configured" | |
| PR-03 | Kalshi keyword match — fed | Create rec with title containing "federal reserve rate cut" | Routes to `"kalshi"` if configured | |
| PR-04 | Kalshi keyword match — crypto | Create rec with title containing "bitcoin" or "btc" | Routes to `"kalshi"` if configured | |
| PR-05 | Kalshi keyword match — economics | Create rec with title containing "cpi", "inflation", "gdp", "unemployment" | Routes to `"kalshi"` if configured | |
| PR-06 | Polymarket-only keywords | Create rec with title containing "war", "invasion", "assassination", "sports", "oscar" | Routes to `"polymarket"` if configured AND not US mode | |
| PR-07 | US mode blocks Polymarket | Set `US_JURISDICTION_MODE=true`, rec matches Polymarket-only keywords | Routes to `"kalshi"` (not Polymarket), or `"paper"` if Kalshi not configured, reason mentions US jurisdiction | |
| PR-08 | Non-US mode allows Polymarket | Set `US_JURISDICTION_MODE=false`, rec matches Polymarket-only keywords, Polymarket configured | Routes to `"polymarket"` | |
| PR-09 | Kalshi fallback in non-US | Set `US_JURISDICTION_MODE=false`, Polymarket not configured | Falls back to `"kalshi"` if configured, reason: "Falling back to Kalshi" | |
| PR-10 | No platform configured | Remove all platform credentials, route any rec | Routes to `"paper"`, `tradeable: false` | |
| PR-11 | Kalshi overrides Polymarket for dual-match | Rec title matches both Kalshi keywords AND Polymarket-only keywords | Kalshi wins when `kalshiMatch && !polymarketOnlyMatch` is false — if only Polymarket matches and not Kalshi, Polymarket is used | |

### 4.14 Market Radar (E8)
**Endpoints:** `GET /api/radar/alerts`, `GET /api/radar/prices`, `POST /api/radar/scan`, `GET /api/radar/chains/:assetId`, `GET /api/radar/chains`, `GET /api/radar/thresholds`, `GET /api/radar/history`, `GET /api/radar/status`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| MR-01 | Radar alerts — defaults | `GET /api/radar/alerts` | Returns `{"alerts": [...], "total": N, "generatedAt": "ISO timestamp"}` with default 4 hours lookback | |
| MR-02 | Alerts — hours param | `GET /api/radar/alerts?hours=12` | Returns alerts from last 12 hours (clamped 1–24) | |
| MR-03 | Alerts — type filter | `GET /api/radar/alerts?type=price_spike` | Only price spike alerts returned | |
| MR-04 | Alerts — severity filter | `GET /api/radar/alerts?severity=high` | Only high severity alerts returned | |
| MR-05 | Alerts — combined filters | `GET /api/radar/alerts?hours=8&type=volume_anomaly&severity=critical` | Filters applied together correctly | |
| MR-06 | Alert fields complete | Check any alert object | Contains: `id`, `type`, `severity`, `assetId`, `assetLabel`, `title`, `pctChange`, `direction`, `priceStart`, `priceNow`, `windowMinutes`, `thresholdPct`, `volumeMultiplier`, `volumeType`, `confidence`, `reason`, `triggerAsset`, `triggerPct`, `chainAssets`, `historicalNote`, `aiScanning`, `note`, `dataSource`, `createdAt` | |
| MR-07 | Prices with spike status | `GET /api/radar/prices` | Returns `{"prices": [...], "total": N, "updatedAt": "ISO timestamp"}` | |
| MR-08 | Price fields complete | Check any price object | Contains: `assetId`, `assetLabel`, `price`, `spikeDetected` (boolean), `pctChange`, `severity`, `threshold`, `updatedAt` | |
| MR-09 | Manual scan — start | `POST /api/radar/scan` | Returns `{"status": "scan_started", "message": "Radar scan running in background..."}` | |
| MR-10 | Idempotent scan lock | `POST /api/radar/scan` twice rapidly | Second request returns `{"status": "scan_already_running", "message": "A radar scan is already in progress..."}` | |
| MR-11 | Scan lock releases | Wait 30s after scan, `POST /api/radar/scan` again | New scan starts (lock released after previous completed) | |
| MR-12 | Chain map — single asset | `GET /api/radar/chains/brent_crude` | Returns `{"assetId": "brent_crude", "chains": [...], "total": 6, "note": "When BRENT CRUDE moves significantly..."}` with 6 chain reactions | |
| MR-13 | Chain map — unknown asset | `GET /api/radar/chains/nonexistent` | Returns `{"assetId": "nonexistent", "chains": [], "total": 0, "note": "..."}` | |
| MR-14 | Full chain map | `GET /api/radar/chains` | Returns `{"chains": {...}, "totalAssets": 8, "note": "Full cross-asset correlation map..."}` covering: `brent_crude`, `wti_crude`, `ttf_gas`, `crypto_btc`, `stock_spy`, `wheat`, `gold`, `copper` | |
| MR-15 | Spike thresholds | `GET /api/radar/thresholds` | Returns `{"thresholds": {...}, "total": 18, "note": "Configure spike sensitivity..."}` with `pct`, `window`, `severity` per asset | |
| MR-16 | History — defaults | `GET /api/radar/history` | Returns `{"alerts": [...], "total": N, "byType": {...}, "bySeverity": {...}, "periodDays": 7}` (default 7 days, 100 limit) | |
| MR-17 | History — custom params | `GET /api/radar/history?days=14&limit=50` | Returns alerts from last 14 days, max 50 (clamped: days 1–30, limit 1–500) | |
| MR-18 | History breakdowns | Check `byType` and `bySeverity` in history | Contains count maps like `{"price_spike": 5, "volume_anomaly": 3}` | |
| MR-19 | Radar engine status | `GET /api/radar/status` | Returns `{"engine": "E8 Market Radar", "scanFrequency": "Every 5 minutes", "assetsMonitored": 18, "chainMaps": 8, "sources": {...}, "activeSources": N, "totalSources": 9}` | |
| MR-20 | Status source details | Check individual source in status | Each source has `status`, `tier`, `note` fields | |
| MR-21 | 5-min auto-scan cron | Watch console for 5-min cron job | Radar scan fires every 5 minutes automatically | |
| MR-22 | Prices sorted by pctChange | Check `GET /api/radar/prices` order | Sorted by `|pctChange|` descending | |
| MR-23 | Threshold format string | Check price `threshold` field | Format: `"X% / Ymin"` (e.g., `"2.0% / 15min"`) or `"—"` for assets without thresholds | |

### 4.15 Radar Scan Engine Deep Testing
These tests verify the internal spike detection, chain reaction, volume anomaly, and alert storage logic.

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| RE-01 | Price history accumulates | Trigger multiple radar scans over 10+ minutes | Price history builds up per asset (stored in memory, 2-hour window) | |
| RE-02 | Price history pruned at 2 hours | Check after 2+ hours of scanning | Old price entries older than 2 hours are removed from memory | |
| RE-03 | Spike detection — threshold match | Asset moves >= its threshold % within its window | `price_spike` alert generated with correct `pctChange`, `direction`, `severity` | |
| RE-04 | Spike detection — below threshold | Asset moves < its threshold % | No alert generated | |
| RE-05 | Spike needs ≥2 price points | First scan for a brand-new asset | No spike detected (only 1 price point, no comparison possible) | |
| RE-06 | Specific thresholds verified | `GET /api/radar/thresholds`, check `brent_crude` | `pct: 2.0`, `window: 15`, `severity: "critical"` | |
| RE-07 | Specific thresholds verified | Check `crypto_btc` | `pct: 3.0`, `window: 15`, `severity: "high"` | |
| RE-08 | Specific thresholds verified | Check `stock_spy` | `pct: 1.0`, `window: 10`, `severity: "high"` | |
| RE-09 | Specific thresholds verified | Check `crypto_sol` | `pct: 5.0`, `window: 15`, `severity: "medium"` | |
| RE-10 | Alert cooldown — 30 minutes | Trigger a spike alert, trigger another for same asset within 30 min | Second alert suppressed (cooldown active) | |
| RE-11 | Alert cooldown expires | Wait 30+ minutes after an alert, trigger another spike | New alert generates (cooldown expired) | |
| RE-12 | Chain reactions fire on spike | Spike detected on `brent_crude` | Chain reaction alerts generated for `wti_crude`, `stock_xle`, `airlines`, `ttf_gas`, `nok_usd`, `cad_usd` | |
| RE-13 | Chain confidence ≥ 60 filter | Check chain reactions for `brent_crude` | Only reactions with `confidence >= 60` are included | |
| RE-14 | Chain confidence < 60 excluded | Check `gold → crypto_btc` chain | `crypto_btc` chain (confidence 52) is NOT fired as an alert | |
| RE-15 | Chain reaction alert type | Check a chain reaction alert | `type: "chain_reaction"`, `severity: "medium"`, has `triggerAsset`, `triggerPct`, `confidence`, `reason` | |
| RE-16 | Volume anomaly detection | Scan when SPY/QQQ/GLD/USO/XLE volume > threshold × 30-day average | `volume_anomaly` alert generated with `volumeMultiplier`, `volumeType: "equity_volume"` | |
| RE-17 | Volume severity escalation | Volume >= threshold × 1.5 | Severity escalates from `"medium"` to `"high"` | |
| RE-18 | Volume cooldown | Volume anomaly fires, trigger another scan immediately | Second volume alert suppressed (same cooldown system, keyed `vol_[assetId]`) | |
| RE-19 | Volume thresholds per asset | Check volume detection | SPY/QQQ: 2.5×, XLE: 3.0×, BTC/ETH: 2.0×, wheat/gold/WTI: per config, default fallback: 3.0× | |
| RE-20 | Volume needs 10+ days data | Asset with < 10 days of volume history | No volume anomaly generated (insufficient data) | |
| RE-21 | Historical note attached | Spike on `brent_crude` | Alert `historicalNote` = "Moves of this magnitude without news have preceded breaking geopolitical events within 60 min..." | |
| RE-22 | Historical note — BTC | Spike on `crypto_btc` | Alert `historicalNote` references CME futures premium and exchange reserves | |
| RE-23 | Historical note — no data | Spike on asset without historical pattern | `historicalNote` = "Monitoring for catalyst — no historical pattern data available for this asset yet." | |
| RE-24 | Alert ID is unique | Check alert IDs | MD5 hash of `assetId + ISO timestamp`, first 10 chars | |
| RE-25 | Alert deduplication in DB | Same alert ID inserted twice | `onConflictDoUpdate` updates `title` and `severity` only — no duplicate rows | |
| RE-26 | Asset label formatting | Check alert `assetLabel` for `crypto_btc` and `stock_spy` | Underscores replaced with spaces, `crypto_` and `stock_` prefixes stripped, uppercased: "BTC", "SPY" | |
| RE-27 | Spike title format | Check price spike alert title | Format: "[LABEL] [up/down] [X.X]% in [N] minutes" | |
| RE-28 | Chain assets in spike alert | Check spike alert `chainAssets` field | Lists up to 6 chain reaction asset IDs from `CHAIN_REACTIONS` map | |
| RE-29 | AI scanning note | Check spike alert `aiScanning` | Format: "Scanning Reuters, AP, Bloomberg for [LABEL] catalyst..." | |
| RE-30 | Data source attribution | Check spike alert `dataSource` | "Yahoo Finance / CoinGecko" | |
| RE-31 | Zero/negative price skipped | Asset returns price = 0 or negative from API | Skipped entirely — no price history update, no spike check | |

### 4.16 Macro Intelligence (BLS, BEA, Fed Funds, Kalshi)
**Service:** `services/macro-data.ts`
**Endpoints:** `GET /api/radar/macro/bls`, `GET /api/radar/macro/bea`, `GET /api/radar/prediction-prices`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| MX-01 | Fed funds rate fetch | Call `getFedFundsRate()` (via scan logs) or check macro context | Returns `{rate, targetRangeLow, targetRangeHigh, asOf}` from NY Fed; `rate ≈ 3.64%` (recent), target range `3.50–3.75%` | |
| MX-02 | BLS CPI fetch | `GET /api/radar/macro/bls` (key set) | `cpi` field shows recent CPI value (~330.2, asOf YYYY-MM), source = Bureau of Labor Statistics | |
| MX-03 | BLS Unemployment fetch | Same call | `unemployment` field shows recent value (~4.3%), asOf YYYY-MM | |
| MX-04 | BLS combined POST | Inspect server logs during BLS fetch | `fetchBLSMacro()` makes a single combined POST for both series (CPI + Unemployment) — not two separate calls | |
| MX-05 | BLS year+period desc sort | Inspect series response order | Observations sorted by `year` then `period` descending so most recent is index 0 | |
| MX-06 | BLS auto-fallback to unregistered | Set `BLS_API_KEY=invalid`, hit endpoint | Server detects key rejected (sets `blsKeyRejected=true`), falls back to unregistered call (25 calls/day), still returns data | |
| MX-07 | BLS 24h cache | Hit `/api/radar/macro/bls` twice in 1 minute | Second call returns same payload from in-memory cache, no second outbound BLS request | |
| MX-08 | BLS cache key includes auth status | Toggle `BLS_API_KEY` between set/unset | Cache busts so registered vs unregistered values don't collide | |
| MX-09 | BEA GDP fetch | `GET /api/radar/macro/bea` (key set) | `gdp` field shows current quarter (e.g., `2025Q4 = 0.5%`), prior quarter, change %, source = Bureau of Economic Analysis | |
| MX-10 | BEA explicit Year params | Inspect outbound BEA request | Uses explicit `Year=currentYear..currentYear-4` (NOT `LAST5`, which doesn't work for NIPA T10101) | |
| MX-11 | BEA NIPA table | Inspect BEA request | `TableName=T10101`, `Frequency=Q`, `LineNumber=1` | |
| MX-12 | BEA 24h cache | Hit `/api/radar/macro/bea` twice in 1 minute | Second call returns from cache, no second outbound request | |
| MX-13 | BEA QoQ change formula | Compute `(current - prior) / |prior| * 100` | Matches the `change` field in response (e.g., 0.5 vs 4.4 → −88.64%) | |
| MX-14 | Kalshi prediction prices | `GET /api/radar/prediction-prices` | Returns `{"prices": {...}, "asOf": "..."}` with non-null Kalshi values for `FED-CUT`, `BTC-100K`, `RECESSION-2026` (no API key required) | |
| MX-15 | Kalshi failure isolation | Block Kalshi domain, hit `/api/radar/prediction-prices` | Returns null/missing values for failed markets, no crash | |
| MX-16 | `fetchMacroContext()` orchestration | Inspect logs / coach prompt | Runs Fed + BLS + BEA in parallel via `Promise.allSettled`, builds MACRO CONTEXT block from whichever succeeded | |
| MX-17 | Macro context resilient to all failures | Disable all 3 sources, call coach | Macro block is empty/short, but coach still responds — no crash | |
| MX-18 | Macro endpoints require auth | Hit `/api/radar/macro/bls` and `/macro/bea` without cookie | Returns 401 (radar router is mounted under `requireAuth`) | |

### 4.17 Scheduler & Background Jobs

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| SCH-01 | Market refresh fires every 5 min | Watch server console for 10+ minutes | At least 2 market refresh cycles complete (logged as "Market data refresh complete") | |
| SCH-02 | Recommendation scan fires every 30 min | Watch console for 35+ minutes | Recommendation scan fires once (logged as "E6: Briefing generated") | |
| SCH-03 | Radar scan fires every 5 min | Watch console for 10+ minutes | At least 2 radar scans complete (logged as "E8: Radar scan complete" or "E8: No anomalies detected this scan") | |
| SCH-04 | Initial refresh at 3 seconds | Restart app, watch console with timestamp | "Running initial market data refresh..." appears ~3 seconds after "Scheduler started" | |
| SCH-05 | Market refresh lock | Trigger manual `POST /api/markets/refresh` while auto-refresh running | If `isRefreshing` is true, the scheduled refresh skips: "Market refresh already in progress, skipping" | |
| SCH-06 | Recommendation scan lock | Trigger `POST /api/recommendations/scan` while auto-scan running | If `isScanning` is true, skips: "Recommendations scan already in progress, skipping" | |
| SCH-07 | Radar scan lock | Trigger `POST /api/radar/scan` while auto-scan running | If `isRadarScanning` is true, skips: "Radar scan already in progress, skipping" | |
| SCH-08 | Lock releases on success | Wait for a scheduled job to complete | Lock flag resets to `false`, next scheduled run proceeds normally | |
| SCH-09 | Lock releases on failure | Force a job to fail (e.g., kill DB connection briefly) | Lock flag still resets to `false` (try/finally), next run proceeds — NOT permanently locked | |
| SCH-10 | Market refresh error logging | Force refresh failure | Console shows "Scheduled market refresh failed" with error message, app continues | |
| SCH-11 | Recommendation scan error logging | Force scan failure | Console shows "Scheduled recommendations scan failed" with error message, app continues | |
| SCH-12 | Radar scan error logging | Force radar failure | Console shows "Scheduled radar scan failed" with error message, app continues | |
| SCH-13 | Radar scan logs alert count | Trigger radar scan when spikes are detected | Console shows "Radar scan complete" with `{count: N}` | |
| SCH-14 | All 3 jobs run independently | Observe console over 30+ minutes | Market refresh and radar scan fire every 5 min (independently), recommendation scan fires every 30 min — no interference between jobs | |
| SCH-15 | Server stays stable over time | Leave app running for 2+ hours | No memory leaks, no crashes, all scheduled jobs continue firing | |

### 4.18 API Schema & Error Handling

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| API-01 | All GET endpoints return valid JSON | Hit every GET endpoint listed in Appendix A | Valid JSON response, correct HTTP status codes | |
| API-02 | POST endpoints validate input (Zod) | Send `POST /api/portfolio/trade` with `{"direction": "invalid"}` | Returns Zod validation error, not 500 | |
| API-03 | POST with empty body | Send `POST /api/coach/analyze` with `{}` | Returns Zod validation error (`question` is required string) | |
| API-04 | 404 on unknown routes | `GET /api/nonexistent` | Returns 404, not 500 or HTML | |
| API-05 | 500 errors include message | Trigger a server error | Returns `{"error": "descriptive message"}` | |
| API-06 | Numeric ID coercion | `GET /api/markets/abc` | Returns Zod coercion error or 500 (not crash) | |
| API-07 | Response shapes match Zod schemas | Compare actual response to generated Zod schemas in `lib/api-zod` | All fields present and correctly typed | |
| API-08 | 401 on auth-required endpoints | Hit any protected endpoint without cookie | Returns 401, not silent failure or 500 | |
| API-09 | 503 on missing optional integration | Hit `/api/whales/flow-alerts`, `/api/radar/options-flow`, `/api/radar/macro/bls`, `/api/radar/macro/bea` without their respective keys | Returns 503 with descriptive error message | |

### 4.19 Frontend Page & Route Testing

All pages use Wouter for routing with a shared Layout component. React Query caches data for 5 minutes (`staleTime: 5min`, `refetchOnWindowFocus: false`). Every page must load without blank screens, console errors, or uncaught exceptions on all target browsers and devices.

**Routes:** `/` (Scanner), `/market/:id` (Market Detail), `/portfolio` (Portfolio), `/coach` (Coach), `/briefing` (Briefing), `/radar` (Radar), `/whales` (Smart Money), `/settings` (Settings), `/login` (Login), `/register` (Register), catch-all (Not Found)

#### 4.19.1 Page Load & Render

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| FE-01 | Scanner page loads | Navigate to `/` | Markets list renders with asset cards/rows, sector filter visible, sort dropdown visible, no console errors | |
| FE-02 | Market Detail page loads | Navigate to `/market/1` | Asset name, price, AI probability, edge, signals list, related markets all render | |
| FE-03 | Portfolio page loads | Navigate to `/portfolio` | Balance displayed, open trades section visible, closed trades section visible, stats section visible | |
| FE-04 | Coach page loads | Navigate to `/coach` | Question input field visible, submit button visible, no pre-existing errors | |
| FE-05 | Briefing page loads | Navigate to `/briefing` | Briefing summary shown (or "No briefing available yet"), recommendations section, events section, every rec card shows the small `assetTitle` label below its main title | |
| FE-06 | Radar page loads | Navigate to `/radar` | Alerts list visible, price monitor visible, chain reaction map accessible, no console errors | |
| FE-07 | Smart Money page loads | Navigate to `/whales` | UW data sections render (options flow, dark pool, Market Tide, congress, crypto whales), no console errors | |
| FE-08 | Settings page loads | Navigate to `/settings` | Account info section, trading credentials CRUD section, change-password section visible | |
| FE-09 | Login page loads | Navigate to `/login` while logged out | Email + password fields, submit, link to `/register` | |
| FE-10 | Register page loads | Navigate to `/register` while logged out | Name + email + password fields, submit, link to `/login` | |
| FE-11 | Not Found page | Navigate to `/nonexistent-route` | Renders 404 page, does NOT show blank screen or crash | |
| FE-12 | Market Detail — invalid ID | Navigate to `/market/99999` | Shows error state ("Market not found"), does NOT crash or show blank page | |

#### 4.19.2 Navigation & Routing

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| FE-13 | Nav links work | Click each navigation link in Layout header/sidebar | Correct page renders, URL updates, no full-page reload (client-side routing) | |
| FE-14 | Scanner → Market Detail | Click any market row on Scanner page | Navigates to `/market/{id}` with correct asset details | |
| FE-15 | Market Detail → back | Click back button or browser back | Returns to Scanner with previous scroll position and filters preserved | |
| FE-16 | Briefing → Market Detail | Click a recommendation that links to an asset | Navigates to correct market detail page | |
| FE-17 | Direct URL access | Type `/portfolio` directly in browser address bar | Portfolio page loads correctly (not just via nav clicks) | |
| FE-18 | Deep link — market detail | Share `/market/3` URL with another tester | Page loads correctly with asset ID 3 data | |
| FE-19 | BASE_URL handled | Check that all routes respect `import.meta.env.BASE_URL` | Routes work through Replit's proxy path prefix, not just at root `/` | |
| FE-20 | Scanner active state on detail pages | Navigate to `/market/5` | Scanner nav item shows active state (extended to `/market/:id` paths) | |
| FE-21 | Nav order | Inspect navigation bar | Order: Briefing → Scanner → AI Coach → Portfolio → Radar → Smart Money → Settings | |
| FE-22 | Brand name | Check header/logo | Shows "ARCLION" on both desktop and mobile views | |

#### 4.19.3 Interactive Elements & State

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| FE-23 | Scanner — sector filter | Select different sector from dropdown/tabs | Market list updates to show only that sector, no full page reload | |
| FE-24 | Scanner — sort change | Change sort option (alpha score, price change, name) | Market list re-orders immediately | |
| FE-25 | Market Detail — Score AI button | Click "Score" / "Re-score" button on market detail | Loading indicator appears, scoring completes, probability/edge/signals update in place | |
| FE-26 | Portfolio — open trade modal | Click trade button on any asset | Trade modal/form appears with asset name, direction selector (long/short), amount input | |
| FE-27 | Portfolio — submit trade | Fill in trade form, submit | Trade appears in open trades list, balance decreases, toast/confirmation shown | |
| FE-28 | Portfolio — close trade | Click close button on an open trade | Trade moves to closed trades, PnL displayed, balance updates | |
| FE-29 | Coach — submit question | Type a question, click submit | Loading indicator appears, AI response renders within 60s with analysis + recommendations | |
| FE-30 | Coach — empty submit | Click submit with empty question field | Validation message shown, request not sent | |
| FE-31 | Briefing — trigger scan | Click "Scan" button on briefing page | Loading indicator, scan starts in background, new recommendations appear after completion | |
| FE-32 | Briefing — watchlist add | Click "Watch" or add-to-watchlist on a recommendation | Item added, confirmation shown, watchlist updates | |
| FE-33 | Radar — manual scan | Click scan/refresh button on radar page | Scan triggers, loading indicator, new alerts appear after completion | |
| FE-34 | Radar — filter alerts | Filter by type (price spike, volume anomaly, chain reaction) or severity | Alert list updates to show only matching alerts | |
| FE-35 | Radar — chain map view | Click on a chain reaction asset or navigate to chain map | Chain reaction map renders with linked assets, directions, confidence | |
| FE-36 | Settings — add credentials | In Settings, add Kalshi credentials | Saved via `POST /api/user/trading-accounts`, success toast | |
| FE-37 | Settings — change password | Submit current + new password | Calls `POST /api/auth/change-password`, success toast | |
| FE-38 | Login form submit | Submit login form with valid creds | Cookie set, redirected to `/` | |
| FE-39 | Login form error | Submit bad credentials | Inline error message shown, no redirect | |
| FE-40 | Logout button | Click logout from nav/settings | Cookie cleared, redirected to `/login` | |
| FE-41 | Toast notifications | Trigger actions that show toasts (trade, scan, error) | Toasts appear, are readable, auto-dismiss after a few seconds | |
| FE-42 | Tooltip component | Hover over elements with tooltips | Tooltips render correctly, positioned properly, don't clip off screen | |

#### 4.19.4 Loading, Error & Empty States

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| FE-43 | Scanner — loading state | Hard refresh / page load | Loading spinner or skeleton shown while markets fetch | |
| FE-44 | Market Detail — loading state | Navigate to `/market/1` | Loading indicator while data fetches | |
| FE-45 | Coach — loading state | Submit a question | Loading indicator while AI responds (up to 60s) | |
| FE-46 | Briefing — empty state | View briefing before any scan has run | Friendly message like "No briefing available yet", not a crash or blank | |
| FE-47 | Portfolio — empty state | View portfolio with no trades | Shows balance, empty trade lists with helpful message | |
| FE-48 | Radar — no alerts state | View radar when no alerts exist | Friendly "No alerts detected" message, not a blank page | |
| FE-49 | API error state | Kill the API server, navigate to any page | Error message rendered on page (e.g., "Failed to load"), no uncaught exception in console | |
| FE-50 | Network timeout | Throttle to very slow connection, load scanner | Page eventually loads or shows timeout error — does NOT hang forever | |

#### 4.19.5 React Query Caching Behavior

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| FE-51 | 5-minute stale time | Load scanner, wait 3 minutes, navigate away and back | Markets load instantly from cache (no new API call) | |
| FE-52 | Cache expires after 5 min | Load scanner, wait 6 minutes, navigate away and back | Fresh API call fires, data updates | |
| FE-53 | No refetch on window focus | Load scanner, switch to another tab, switch back | No new API call triggered on tab focus (`refetchOnWindowFocus` is disabled) | |
| FE-54 | Manual refresh updates cache | Click refresh/re-fetch button (if available on any page) | New data fetched and cache updated, UI reflects changes | |

#### 4.19.6 Responsive Design & Cross-Browser

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| FE-55 | Desktop layout | View every page on 1280px+ screen | Full layout renders, sidebar/header visible, tables/cards properly spaced | |
| FE-56 | Tablet layout | View every page on 768px–1024px screen | Layout adapts, no horizontal scroll, all content accessible | |
| FE-57 | Mobile layout | View every page on 375px–414px screen | Layout stacks vertically, buttons tappable (min 44px), text readable without zoom | |
| FE-58 | Chrome desktop | Full test pass on Chrome 120+ | All pages load, all interactions work | |
| FE-59 | Firefox desktop | Full test pass on Firefox latest | All pages load, all interactions work | |
| FE-60 | Safari desktop | Full test pass on Safari latest | All pages load, all interactions work | |
| FE-61 | Chrome mobile (Android) | Full test pass on Android Chrome | All pages load, touch interactions work, modals usable | |
| FE-62 | Safari mobile (iOS) | Full test pass on iOS Safari | All pages load, touch interactions work, no viewport issues | |
| FE-63 | Edge desktop | Quick smoke test on Edge | All pages load, no major visual issues | |
| FE-64 | Slow 3G connection | Throttle to 3G, navigate through all pages | Pages eventually load with loading states, no timeouts under 30s | |

### 4.20 Smart Money — Unusual Whales Integration
**Endpoints:** `GET /api/whales/status`, `GET /api/whales/flow-alerts`, `GET /api/whales/flow-summary`, `GET /api/whales/darkpool`, `GET /api/whales/darkpool/:ticker`, `GET /api/whales/market-tide`, `GET /api/whales/congress`, `GET /api/whales/crypto-whales`
**Radar-mirrored endpoints:** `GET /api/radar/options-flow`, `GET /api/radar/dark-pool`, `GET /api/radar/congress`, `GET /api/radar/crypto-whales`

| ID | Test case | Steps | Expected result | P/F |
|---|---|---|---|---|
| UW-01 | Whales status | `GET /api/whales/status` | Returns `{"configured": true/false}` based on `UNUSUAL_WHALES_KEY` | |
| UW-02 | Flow alerts | `GET /api/whales/flow-alerts` | Returns `{"alerts": [...]}` with recent options flow data | |
| UW-03 | Flow summary | `GET /api/whales/flow-summary` | Returns flow summary object with aggregated data | |
| UW-04 | Dark pool — recent | `GET /api/whales/darkpool` | Returns `{"prints": [...]}` with dark pool activity | |
| UW-05 | Dark pool — by ticker | `GET /api/whales/darkpool/AAPL` | Returns `{"prints": [...]}` filtered to AAPL dark pool prints | |
| UW-06 | Market Tide | `GET /api/whales/market-tide` | Returns `{"ticks": [...]}` with Market Tide sentiment data | |
| UW-07 | Congressional trades | `GET /api/whales/congress` | Returns `{"trades": [...]}` including `reporter`, `txn_type`, amounts, `filed_at_date`, `transaction_date`, `member_type` | |
| UW-08 | Crypto whales | `GET /api/whales/crypto-whales` | Returns `{"transactions": [...]}` with crypto whale activity | |
| UW-09 | Not configured — 503 (whales) | Remove `UNUSUAL_WHALES_KEY`, hit any UW endpoint (except `/status`) | Returns 503 with `{"error": "Unusual Whales not configured"}` | |
| UW-10 | Not configured — 503 (radar mirror) | Remove key, hit `/api/radar/options-flow`, `/dark-pool`, `/congress`, `/crypto-whales` | Each returns 503 with descriptive error | |
| UW-11 | API error — 502 | Unusual Whales API returns error | Returns 502 with error message, not crash | |
| UW-12 | Smart money in AI prompt | Trigger recommendation scan | Claude prompt includes UW smart money data for higher-conviction calls | |
| UW-13 | Radar integration | Check radar scan with UW data | 4 radar-compatible UW fetchers inject data into radar alerts | |
| UW-14 | Frontend renders | Navigate to `/whales` | All 5 data sections (flow, dark pool, tide, congress, crypto) render or show "not configured" message | |

---

## 5. Phase 3 — User Acceptance Testing (Week 4)

Finance students test real usage scenarios without being told what to do. The goal is discovering where real users get confused, what they misunderstand, and what delights them. Observers take notes — do NOT help unless the tester is completely stuck.

### 5.1 Session Setup
- **Duration:** 90 minutes per session
- **Group size:** 3–5 students per session (so you can observe body language)
- **Device:** student's own phone or a provided tablet — not a desktop (most real users will be mobile)
- **Recording:** screen recording on with permission, or observer takes timestamped notes
- **Starting state:** fresh user account created at start of session, fresh $10,000 paper balance, no prior explanation of features

### 5.2 UAT Scenario Scripts

#### Scenario A — Beginner: Sign Up & First Trade (30 min)
Read this to the tester:
> You've heard that AI can help you find trading opportunities. You've just downloaded ARCLION. Create an account, then explore the app and try to make your first simulated trade. Think out loud as you go — say what you're looking at, what confuses you, what makes sense.

Observer watches for:
- Does the tester find Register without help? Are the password requirements clear?
- Do they find the Scanner without help after login?
- Do they understand what AI probability vs Market price means?
- Do they find the Trade button without prompting?
- Do they understand the trade modal? Do they know what "long" vs "short" means?
- Do they know no real money is involved?
- Does the Portfolio page make sense after their first trade?

#### Scenario B — Intermediate: AI Coach Conversation (30 min)
Read this to the tester:
> The AI Coach is a chat assistant inside the app. Open it and ask whatever questions you would ask a financial advisor about today's market. Decide for yourself whether the answers are useful.

Observer watches for:
- Does the tester find the Coach without help?
- Do they ask general questions ("what looks good?") or specific ones ("how is BTC?")?
- Do the responses include real numbers (prices, edges, Fed funds rate)? Does that build trust?
- Do they notice macro context (CPI, GDP, unemployment) showing up?
- Do they ever get a "I don't have access to real-time data" response? *(If yes, this is a P1 bug.)*

#### Scenario C — Intermediate: Acting on a Recommendation (30 min)
Read this to the tester:
> The AI has just flagged a trading opportunity in the Daily Briefing. Your job is to evaluate whether you agree with the AI's reasoning and decide whether to paper trade it. Use whatever information you can find in the app to make your decision.

Observer watches for:
- Does the tester navigate to the briefing page without help?
- Do they read the historical context and bear case?
- Do they click through to the asset detail page for more information?
- Do they use the AI Coach before deciding?
- What is their decision rationale? Does the edge concept make sense to them?
- Does the asset-title label under each recommendation help them understand what asset it's about?

#### Scenario D — Advanced: Market Radar & Platform Review (30 min)
Read this to the tester:
> You are a finance professional reviewing this AI trading tool. Spend 15 minutes exploring the Market Radar — what alerts does it surface, and do the chain reaction maps make sense? Then spend 15 minutes reviewing the live trading pipeline: how does the approval flow work, and would you trust it with real capital?

Observer watches for:
- Do they understand the radar alert types (price spike, volume anomaly, chain reaction)?
- Do the chain reaction maps make intuitive sense to them?
- What do they question about the AI methodology?
- Do they trust the evidence sources shown?
- What would make them trust it more?
- What features do they wish existed?

### 5.3 Post-Session Survey
Every tester completes this after their session. Score 1–5 (1=strongly disagree, 5=strongly agree):

| Question | Score 1–5 | Comments |
|---|---|---|
| I understood what ARCLION does within the first 2 minutes | | |
| Creating an account was easy and quick | | |
| I understood the difference between AI probability and market price | | |
| I understood that paper trading uses no real money | | |
| I understood what "long" and "short" mean in this context | | |
| The Daily Briefing recommendations were clear and actionable | | |
| The AI Coach explanation helped me understand the trade | | |
| The AI Coach quoted specific numbers I could verify | | |
| The Market Radar alerts were useful and understandable | | |
| I could complete a paper trade without help | | |
| I would use this app for real investment research | | |
| The app worked well on my device | | |
| I would recommend this to other finance students | | |
| I would trust this AI with real trading decisions after more practice | | |

Open questions (written response):
- What was the most confusing part of the app?
- What was the most impressive feature?
- What feature is missing that you would want?
- Did the AI Coach ever say it didn't have data when you expected it to? Where?
- Would you use this on your phone? Why or why not?

---

## 6. Phase 4 — Pre-Launch Validation (Week 5)

### 6.1 Load Testing

| Test | Method | Target | Pass criterion |
|---|---|---|---|
| 10 simultaneous users | Open app on 10 devices at same time | All users browsing scanner | No timeouts, response < 3s |
| 5 concurrent AI scores | 5 testers click Re-score AI simultaneously | All score different markets | All complete within 120s, no crashes |
| 5 concurrent Coach asks | 5 users send Coach questions simultaneously | All get unique responses | All complete within 60s, each cites live data |
| Scheduler under load | Background jobs fire while 10 users active | All 3 cron jobs run concurrently with user traffic | Jobs complete, no user-facing slowdown |
| Concurrent market refreshes | Trigger `POST /api/markets/refresh` while cron is refreshing | `isRefreshing` lock | Only one refresh runs, cron skips with log message |
| Concurrent recommendation scans | Trigger `POST /api/recommendations/scan` while cron is scanning | `isScanning` lock | Only one scan runs, cron skips with log message |
| Concurrent radar scans | 3 users trigger `POST /api/radar/scan` at same time | `isRadarScanning` lock | Only one scan runs, others return `scan_already_running` |
| Macro cache under load | 10 concurrent hits to `/api/radar/macro/bls` and `/macro/bea` | 24h cache | Only first request hits BLS/BEA APIs; rest served from cache |
| Sustained 2-hour run | Leave app running with all cron jobs active, 5 users browsing | Stability over time | No memory leaks, no crashes, all jobs continue firing on schedule |

### 6.2 Security Checklist

| Check | How to verify | Pass criterion |
|---|---|---|
| No API keys in frontend code | View page source in browser, search for key names | Zero API keys visible in browser |
| Replit Secrets not in code | Search codebase for hardcoded keys | All secrets loaded from `process.env` |
| `UNUSUAL_WHALES_KEY` server-side only | Grep frontend code for `UNUSUAL_WHALES` | Zero matches in frontend |
| `BLS_API_KEY` server-side only | Grep frontend code | Zero matches in frontend |
| `BEA_API_KEY` server-side only | Grep frontend code | Zero matches in frontend |
| `SESSION_SECRET` server-side only | Grep frontend code | Zero matches in frontend |
| `CREDENTIALS_ENCRYPTION_KEY` server-side only | Grep frontend code | Zero matches in frontend |
| Risk config env vars secured | Check risk defaults via behavior testing | `MIN_EDGE`, `MIN_CONFIDENCE`, `MAX_POSITION_PCT`, `MAX_DAILY_TRADES`, `DAILY_LOSS_LIMIT_PCT` not exposed in any API response |
| Platform credentials not exposed | `GET /api/trading/accounts` and `GET /api/user/trading-accounts` | Response shows status (configured/not_configured) but never returns actual API keys or passwords |
| Per-user trading creds isolated | Login as user A, save creds; login as B, list | User B sees zero of user A's credentials |
| User credentials encrypted at rest | Inspect `user_trading_accounts` table directly | Stored as opaque encrypted blob, never plaintext |
| Password storage | Inspect `users.password_hash` | Bcrypt hash, never plaintext |
| JWT signed with `SESSION_SECRET` | Tamper with token | Returns 401 |
| Auth cookie HTTP-only | Inspect cookie in browser devtools | `HttpOnly` flag set, JS cannot read it |
| Login does not enumerate users | Login with unknown email vs wrong password | Both return same generic error |
| Risk gate enforced | Test all 5 risk checks: edge, confidence, max position %, daily loss limit, daily trade count | All rejections fire when thresholds exceeded |
| Radar scan lock prevents abuse | Rapid-fire `POST /api/radar/scan` | Lock prevents concurrent scans, returns `scan_already_running` |
| Scheduler locks prevent abuse | Rapid-fire all 3 scan/refresh endpoints | All 3 locks work independently, prevent concurrent executions |
| Zod validation on all POST routes | Send invalid types to every POST endpoint | Server-side Zod schemas reject invalid data, return descriptive errors |
| All protected routes mounted under `requireAuth` | Inspect `routes/index.ts` | `/markets`, `/signals`, `/portfolio`, `/coach`, `/recommendations`, `/trading`, `/radar`, `/whales`, `/user` all wrapped with `requireAuth` |

### 6.3 Data Quality Validation

| Check | Criteria | Tester |
|---|---|---|
| AI probabilities are calibrated | Sample 10 markets: AI probability within 15pts of market on well-traded markets | Core + PH Data |
| Evidence sources are real | Check signal `source` values — should reference real data sources | All teams |
| AI generates 3–6 signals per scoring | Score 5 different markets, check signal count | All teams |
| Recommendations have historical context | Every TRADE type recommendation should include `historicalContext` field with year citations | Core |
| Max 3 TRADE calls per briefing | Run 5+ scans, check each briefing `tradeCount` | Never exceeds 3 |
| Bear case present on trade calls | Every `type: "trade"` recommendation should have `bearCase` populated | Finance students |
| `assetTitle` populated on every rec | Inspect 10+ recs after a scan | None blank or null | Core |
| Coach commentary is specific | Coach analysis must reference the actual market/question, not generic advice | All teams |
| Coach quotes live numbers | Sample 10 Coach responses for "what is the X price?" | At least 9/10 quote a specific number from snapshot | Core + Finance |
| Coach never says "no data" | Sample 20 Coach responses across various market questions | Zero "I don't have real-time data" disclaimers | Core |
| Coach fallback works gracefully | Temporarily block AI, send coach request | Returns helpful fallback with 3 tips and low confidence (0.3) |
| Macro values match BLS/BEA | Cross-check `/api/radar/macro/bls` CPI/Unemployment vs bls.gov; `/api/radar/macro/bea` GDP vs bea.gov | Within rounding | PH Data |
| Fed funds rate matches NY Fed | Cross-check Coach/macro context against newyorkfed.org | Matches published rate | PH Data |
| Kalshi prediction prices match | Cross-check `/api/radar/prediction-prices` against kalshi.com markets | Within bid/ask spread | PH Data |
| Briefing references macro | Sample 5 briefings | Each summary or rec set references at least one of: GDP, CPI, inflation, unemployment, Fed funds, recession | Core |
| Radar alerts are accurate | Cross-check 5+ price spike alerts against actual market data | PH Data |
| Chain reaction maps are logical | Review all 8 chain maps via `GET /api/radar/chains` | Correlations make economic sense (oil → airlines bear, BTC → ETH bull, etc.) |
| Volume anomaly thresholds reasonable | Review volume multipliers for SPY/QQQ/GLD/USO/XLE | Multipliers between 2.0× and 3.0× — not too sensitive, not too loose |
| Historical patterns accurate | Check 5 historical notes (`brent_crude`, `crypto_btc`, `wheat`, `gold`, `stock_spy`) | Each note references real historical events with accurate context |
| Alert cooldown prevents spam | Trigger multiple scans in 30 min with same spikes | Same asset doesn't generate duplicate alerts within 30-minute window |

### 6.4 Database Schema Validation

| Check | How to verify | Pass criterion |
|---|---|---|
| All Drizzle tables created | `pnpm --filter @workspace/db run push` | No migration errors |
| `users` table populated | Register a user, query DB | Row inserted with bcrypt hash, role default | 
| `user_trading_accounts` table | Save creds via Settings, query DB | Row inserted with encrypted blob | 
| `assets` table populated | Seed script + `GET /api/markets` | 12+ seeded assets present |
| `signals` table populated | `GET /api/signals/feed/latest` | 11+ seeded signals present |
| `trades` table functional | Open and close a paper trade | Trade records created with correct entry/exit prices, PnL calculated |
| Portfolio balance tracking | `GET /api/portfolio` after trades | Balance updates accurately, scoped to current user |
| `daily_briefings` stored | `POST /api/recommendations/scan`, then `GET /api/recommendations/briefing` | Briefing record with `summary`, `scanNumber`, `generatedAt` |
| `recommendations` linked | Check recommendations after scan | Each has `briefingId` linking to parent briefing |
| `recommendations.assetTitle` populated | Inspect any new recommendation row | `assetTitle` is non-empty for 100% of rows |
| `global_events` stored | `GET /api/recommendations/events` after scan | Events with impact levels and affected assets |
| `watchlist` CRUD | Add then remove items | POST returns item, DELETE returns `{"status": "removed"}` |
| `live_trades` tracked | `POST /api/trading/execute`, then `GET /api/trading/history` | Trade recorded with platform, amount, AI metadata, `paperMode` flag |
| Pending orders flow | Execute with `overrideApproval: false`, approve, then reject another | Status transitions: `pending_approval` → `approved` / `rejected` |
| `radar_alerts` stored | `POST /api/radar/scan`, then `GET /api/radar/alerts` | Alerts with severity, asset data, timestamps |
| Radar alerts dedup | Insert alert with same ID twice | `onConflictDoUpdate` updates `title` and `severity` only — no duplicate rows |
| Scan number incrementing | Run 3 scans, check `daily_briefings` table | `scanNumber` increments correctly |
| Daily trade count query | `getDailyTradeCount()` after trades | Returns count of live trades with `executedAt >= midnight today` |

### 6.5 Launch Sign-Off Checklist

| Item | Signed off by | Date | Status |
|---|---|---|---|
| Phase 1 all checks green | PH Lead QA | | |
| Phase 2 zero critical bugs open | PH Lead QA | | |
| Phase 3 average UAT score >= 3.5/5 | Core Team | | |
| Load test 10 users — no crashes | PH Lead QA | | |
| Security checklist complete | Core Team | | |
| Auth flow end-to-end tested (register → login → use → logout) | PH Lead QA | | |
| Per-user data isolation verified (portfolios, credentials) | PH API Tester | | |
| Encrypted credential storage verified | Core Team | | |
| AI Coach never says "no real-time data" in 20-question sample | Core Team | | |
| AI Coach references live macro (CPI/GDP/Fed) at least once per session | Core Team | | |
| BLS macro endpoint returns live CPI + Unemployment | PH API Tester | | |
| BEA GDP endpoint returns current quarter | PH API Tester | | |
| Kalshi prediction prices live without API key | PH API Tester | | |
| Briefing rec cards display `assetTitle` label | PH Frontend | | |
| $10 live Kalshi test trade successful | Core Team | | |
| AI recommendation quality approved | Core Team | | |
| All 5 risk checks verified server-side | PH API Tester | | |
| Platform router tested for all keyword categories | PH API Tester | | |
| Market Radar alerts accurate and timely | PH Data + Core | | |
| Chain reaction maps reviewed and validated | Core Team | | |
| Scheduler runs stable for 2+ hours | PH Lead QA | | |
| Alert cooldown system working (30-min dedup) | PH API Tester | | |
| AI fallback behavior verified (scoring + coach) | PH API Tester | | |
| Macro fallback behavior verified (Promise.allSettled survives source failures) | PH API Tester | | |
| Financial disclaimer visible on all pages | All teams | | |
| Replit Deployment always-on confirmed | Core Team | | |
| TypeScript typecheck passes with zero errors | PH Lead QA | | |
| Drizzle schema push completes cleanly | PH Lead QA | | |
| Backup/restore procedure documented | PH Lead QA | | |
| Support channel established for testers | Core Team | | |

---

## 7. Bug Reporting & Communication

### 7.1 Bug Severity Levels

| Severity | Definition | Examples | Response time |
|---|---|---|---|
| P1 Critical | App unusable, data loss, security issue, money at risk | App crashes, live trade fires without approval, credentials exposed in plaintext, AI Coach claims "no real-time data" when data is wired, radar scan crashes server, scheduler lock permanently stuck, login fails for valid users | Fix before any launch |
| P2 High | Major feature broken, blocks testing path | Scanner blank, paper trade fails, briefing doesn't load, radar alerts missing, market refresh stops working, BLS/BEA endpoints return 500, Coach responds with empty body | Fix within 24 hours |
| P3 Medium | Feature works but incorrectly or inconsistently | Edge calculation off, wrong color badge, coach note generic, PnL math wrong, chain reaction map incomplete, volume threshold too sensitive, briefing `assetTitle` missing on some cards, macro number stale beyond cache window | Fix within 3 days |
| P4 Low | Minor UI issue, cosmetic, not blocking | Typo, alignment off on one browser, color slightly wrong, alert label capitalization | Fix before launch |
| Enhancement | Not a bug — a missing feature or improvement | User wants X feature, wants Y to work differently | Log for roadmap |

### 7.2 Bug Report Template
Every bug report must include all of the following:

```
ID: [auto-number]
Severity: P1 / P2 / P3 / P4
Title: Short description (e.g. 'AI Coach says "no real-time data" when asked about BTC')
Reporter: Name + team
Date/Time: When observed
Device + Browser: e.g. iPhone 14, Safari 17
User account: e.g. test+5@arclion.ai
Steps to reproduce: Numbered steps that reproduce the bug every time
Expected result: What should happen
Actual result: What actually happened
Screenshot/Recording: Attached
Notes: Any additional context (e.g. "macro endpoint returned 503 at the same time")
```

### 7.3 Communication Channels

| Channel | Purpose | Frequency |
|---|---|---|
| Shared bug tracking sheet (Google Sheets) | All bugs logged here — one row per bug, status tracked | Updated in real time |
| Group chat (WhatsApp / Slack) | Quick questions, screenshots, daily standup notes | Daily during testing weeks |
| Weekly video call | Phase review, bug triage, decisions on P3/P4 fixes | Once per week |
| Philippines team standup | Daily 15-min sync during Phase 1 and 2 | Daily 9am Manila time |
| Finance student debrief | Group discussion after each UAT session | After each session |

### 7.4 Time Zone Coordination

| Location | Time Zone | Overlap with US Eastern |
|---|---|---|
| Manila, Philippines | PHT (UTC+8) | Night in US = Day in Philippines. US 9pm ET = Manila 9am next day |
| US Eastern | ET (UTC-4 summer / UTC-5 winter) | Core working hours for US team |
| Suggested overlap window | US 8–10am ET = Manila 8–10pm PHT | 2-hour daily sync window — adjust as needed |

---

## Appendix A — Complete API Endpoint Reference
All endpoints are prefixed with `/api` (e.g., `GET /api/markets`).

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Health check |

### Auth (public except `/me` and `/change-password`)
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register a new user (body: `email`, `password`, `name`) |
| POST | `/auth/login` | Login (body: `email`, `password`) — returns user + JWT, sets `auth_token` cookie |
| POST | `/auth/logout` | Logout — clears cookie |
| GET | `/auth/me` | Get current authenticated user |
| POST | `/auth/change-password` | Change password (body: `currentPassword`, `newPassword`) |

### User Trading Credentials (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/user/trading-accounts` | List current user's saved platform credentials (statuses only) |
| POST | `/user/trading-accounts` | Save/encrypt credentials for a platform (body: `platform`, `credentials`) |
| DELETE | `/user/trading-accounts/:platform` | Remove saved credentials for a platform |

### Markets (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/markets` | List all markets (query: `sector`, `sort`, `limit`) |
| GET | `/markets/:id` | Market detail with signals and related markets |
| POST | `/markets/:id/score` | Trigger AI scoring via Claude |
| POST | `/markets/refresh` | Refresh all market data from external sources |

### Signals (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/signals/feed/latest` | Latest 20 signals across all assets |
| GET | `/signals/:assetId` | Signals for a specific asset (query: `limit`) |

### Portfolio (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/portfolio` | Portfolio with open/closed trades and balance |
| POST | `/portfolio/trade` | Open a paper trade (body: `assetId`, `direction`, `amount`) |
| POST | `/portfolio/trade/:id/close` | Close a paper trade |
| GET | `/portfolio/stats` | Performance statistics |

### Coach (auth required)
| Method | Path | Description |
|---|---|---|
| POST | `/coach/analyze` | AI coaching analysis with live market snapshot, briefing summary, and macro context (body: `question`, optional `assetId`, `context`) |

### Recommendations (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/recommendations/briefing` | Latest AI intelligence briefing with recommendations and events |
| POST | `/recommendations/scan` | Trigger a new AI recommendations scan (runs in background) |
| GET | `/recommendations/recommendations` | List recommendations (query: `type`, `urgency`, `limit`) |
| GET | `/recommendations/events` | Recent global market events (query: `limit`) |
| GET | `/recommendations/watchlist` | Get watchlist items |
| POST | `/recommendations/watchlist` | Add to watchlist |
| DELETE | `/recommendations/watchlist/:id` | Remove from watchlist |

### Trading (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/trading/accounts` | Platform status (Kalshi/Alpaca/Polymarket) with US jurisdiction info |
| GET | `/trading/route/:recommendationId` | Preview platform routing decision |
| POST | `/trading/execute` | Execute a live trade |
| GET | `/trading/pending` | Get pending approval orders |
| POST | `/trading/pending/:id/approve` | Approve pending order |
| POST | `/trading/pending/:id/reject` | Reject pending order |
| GET | `/trading/history` | Live trade history (query: `limit`, `platform`) |
| GET | `/trading/positions` | Open live trading positions |

### Radar (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/radar/alerts` | Recent radar alerts (query: `hours`, `type`, `severity`) |
| GET | `/radar/prices` | Current prices with spike status |
| POST | `/radar/scan` | Manually trigger radar scan (idempotent lock) |
| GET | `/radar/chains/:assetId` | Chain reaction map for a specific asset |
| GET | `/radar/chains` | Full cross-asset chain reaction map |
| GET | `/radar/thresholds` | Spike detection thresholds per asset |
| GET | `/radar/history` | Historical alerts for trend analysis (query: `days`, `limit`) |
| GET | `/radar/status` | Radar engine status and 9-source availability |
| GET | `/radar/options-flow` | Unusual Whales options flow (radar-shaped, 503 if not configured) |
| GET | `/radar/dark-pool` | Unusual Whales dark pool prints (radar-shaped, 503 if not configured) |
| GET | `/radar/congress` | Unusual Whales congressional trades (radar-shaped, 503 if not configured) |
| GET | `/radar/crypto-whales` | Unusual Whales crypto whale activity (radar-shaped, 503 if not configured) |
| GET | `/radar/prediction-prices` | Live Kalshi prediction market prices (no API key required) |
| GET | `/radar/macro/bls` | BLS CPI + Unemployment (503 if `BLS_API_KEY` not configured) |
| GET | `/radar/macro/bea` | BEA GDP growth (503 if `BEA_API_KEY` not configured) |

### Smart Money — Unusual Whales (auth required)
| Method | Path | Description |
|---|---|---|
| GET | `/whales/status` | Unusual Whales configuration status |
| GET | `/whales/flow-alerts` | Recent options flow alerts |
| GET | `/whales/flow-summary` | Aggregated flow summary |
| GET | `/whales/darkpool` | Recent dark pool prints |
| GET | `/whales/darkpool/:ticker` | Dark pool prints for a specific ticker |
| GET | `/whales/market-tide` | Market Tide sentiment ticks |
| GET | `/whales/congress` | Congressional trading data |
| GET | `/whales/crypto-whales` | Crypto whale transactions |

---

## Appendix B — Service Architecture Reference

| Service | File | Cron Schedule | Lock Flag | Key Logic |
|---|---|---|---|---|
| Auth | `services/auth.ts` | — | — | bcrypt password hashing, JWT generation/verification with `SESSION_SECRET`, AES encryption/decryption of trading credentials with `CREDENTIALS_ENCRYPTION_KEY` |
| Market Data | `services/market-data.ts` | Every 5 min | `isRefreshing` | Fetches CoinGecko (BTC/ETH/SOL) + Yahoo Finance (SPY/QQQ/GLD/USO/UNG/EURUSD) in parallel, updates `assetsTable`, 10s timeout per source |
| Recommendations | `services/recommendations.ts` | Every 30 min | `isScanning` | Reads top 30 assets + 50 signals, builds Claude prompt with MACRO CONTEXT block, generates events + recs + summary, matches by name/symbol, stores to DB |
| Market Radar | `services/market-radar.ts` | Every 5 min | `isRadarScanning` | Fetches all prices, checks 18 spike thresholds, fires chain reactions (confidence ≥ 60), detects volume anomalies (5 tickers), 30-min alert cooldown, `onConflictDoUpdate` dedup |
| AI Scoring | `services/scoring.ts` | On-demand | — | Calls Claude for probability + signals, updates market fields, generates 3–6 evidence signals, fallback scoring on AI failure |
| AI Coach | `services/coach.ts` | On-demand | — | Calls Claude (`claude-sonnet-4-6`, `max_tokens: 1000`) with: updated system prompt forbidding "no data" disclaimer; LIVE MARKET DATA snapshot (top 5 by alphaScore + any asset mentioned in question); latest briefing summary excerpt; asset-specific context (when `assetId` passed); MACRO CONTEXT (Fed funds, CPI, Unemployment, GDP, Kalshi). Order: live data block first, then `User question:`. Parses bullet points for recommendations (max 5), confidence = 0.75, fallback with 3 hardcoded tips on failure |
| Macro Data | `services/macro-data.ts` | On-demand (24h cache) | — | `getFedFundsRate()` (NY Fed), `fetchBLSMacro()` (single combined POST for CPI + Unemployment, year+period desc sort, auto-fallback to unregistered if key rejected), `fetchGDP()` (BEA NIPA T10101 with explicit Year params), `fetchMacroContext()` orchestrates all three via `Promise.allSettled` |
| Kalshi Markets | `services/kalshi-markets.ts` | On-demand | — | `fetchKalshiMarketPrice()` per market, `fetchAllPredictionPrices()` returns FED-CUT, BTC-100K, RECESSION-2026, etc., no API key required |
| Platform Router | `services/platform-router.ts` | On-demand | — | Kalshi/Alpaca/Polymarket routing by keyword + asset class, 5-gate risk checks, pending order + live trade logging |
| Unusual Whales | `services/unusual-whales.ts` | On-demand | — | 4 radar-compatible fetchers (flow, dark pool, congress, crypto), smart money data injected into Claude prompt for higher-conviction trade calls |
| Benzinga | `services/benzinga.ts` | — | — | Placeholder — real fetcher returns null until paid subscription is activated |
| Scheduler | `services/scheduler.ts` | Startup | — | Orchestrates all cron jobs, fires initial market refresh 3s after boot via `setTimeout` |

---

## Appendix C — Environment Secrets Reference

| Secret | Required | Used By | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | All persistence | Replit-managed Postgres |
| `SESSION_SECRET` | Yes | Auth (JWT signing) | Strong random string |
| `CREDENTIALS_ENCRYPTION_KEY` | Yes | User trading credentials | AES key for at-rest encryption |
| `BLS_API_KEY` | Optional | Macro (BLS CPI/Unemployment) | Without it, falls back to unregistered (25 calls/day); endpoint returns 503 |
| `BEA_API_KEY` | Optional | Macro (BEA GDP) | Endpoint returns 503 if missing |
| `UNUSUAL_WHALES_KEY` | Optional | Smart Money + radar mirror endpoints | All UW + radar mirror endpoints return 503 if missing |
| `ALPHA_VANTAGE_KEY` | Optional | Radar status (paid commodity prices) | Status reports `not_configured` if missing |
| `FINNHUB_KEY` | Optional | Radar status (news catalysts) | Status reports `not_configured` if missing |
| `KALSHI_EMAIL` / `KALSHI_PASSWORD` | Optional | Live trading (Kalshi) | Required for live Kalshi trades; not required for prediction prices |
| `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` | Optional | Live trading (stocks/ETFs) | Required for Alpaca routing |
| `US_JURISDICTION_MODE` | Optional | Platform router | Defaults to `true` (blocks Polymarket live) |
| `MIN_EDGE`, `MIN_CONFIDENCE`, `MAX_POSITION_PCT`, `MAX_DAILY_TRADES`, `DAILY_LOSS_LIMIT_PCT`, `REQUIRE_APPROVAL` | Optional | Risk gate | All have safe defaults |

---

## Final Note — Paper Trading Explanation for All Testers

Every tester must understand this before starting: **Paper trading in ARCLION is a fully digital, in-app simulation. No broker is called. No real money changes hands. The $10,000 balance is fictional and exists only within the app.** A paper trade is executed by clicking a button on your phone or computer screen — exactly like a real trade will be, but with zero financial risk.

The AI Coach now ships with a live market snapshot, the latest daily briefing, and macro context (Fed Funds, CPI, Unemployment, GDP, Kalshi prediction probabilities) injected into every conversation. If a tester ever sees the Coach claim it doesn't have real-time data, that is a **P1 bug** — file it immediately.

— ARCLION Testing Plan v3.0 · Confidential —
