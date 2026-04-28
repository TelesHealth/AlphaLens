# Arclion — Intelligence Briefing Platform
**Internal codename:** AlphaLens | **Version:** 1.0.4-beta | **April 2026**

AI-powered global investment intelligence platform. Real-time market radar, proactive trade recommendations, live trading via Kalshi & Alpaca, per-user portfolio management, and an AI probability coach. Built with Node.js, TypeScript, Express, React, and Claude AI.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo tool | pnpm workspaces |
| Node.js version | 24 |
| Package manager | pnpm |
| TypeScript version | 5.9 |
| Frontend | React + Vite + TailwindCSS + Wouter + TanStack React Query v5 |
| API framework | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| AI | Anthropic Claude (claude-sonnet-4-6) via Replit AI proxy |
| Validation | Zod (zod/v4), drizzle-zod |
| Auth | JWT (jsonwebtoken) + bcryptjs + httpOnly cookies |
| Encryption | AES-256-GCM (per-user trading credentials) |
| API codegen | Orval (from OpenAPI spec) |
| Markdown | react-markdown + remark-gfm |
| Build | esbuild (API), Vite (frontend) |

---

## Directory Structure

```
artifacts-monorepo/
├── artifacts/
│   ├── api-server/              # Express API server (port 8080)
│   │   └── src/
│   │       ├── middleware/      # auth.ts (requireAuth, requireAdmin, optionalAuth)
│   │       ├── routes/          # markets, signals, portfolio, coach,
│   │       │                    # recommendations, trading, radar,
│   │       │                    # whales, auth, trading-credentials, health
│   │       └── services/        # scoring (AI), coach (AI), recommendations (AI),
│   │                            # market-data, market-radar, unusual-whales,
│   │                            # platform-router, scheduler, auth,
│   │                            # kalshi-markets, macro-data, benzinga (stub)
│   ├── alpha-lens/              # React + Vite frontend (previewPath: /)
│   └── mockup-sandbox/          # Design preview server
├── lib/
│   ├── api-spec/                # OpenAPI spec + Orval codegen config
│   ├── api-client-react/        # Generated React Query hooks
│   ├── api-zod/                 # Generated Zod schemas from OpenAPI
│   ├── db/                      # Drizzle ORM schema + DB connection
│   └── integrations-anthropic-ai/  # Anthropic AI via Replit proxy
├── scripts/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | User accounts (email, passwordHash, name, role, isActive) |
| `user_trading_accounts` | Per-user encrypted trading credentials (Kalshi, Alpaca, Polymarket) |
| `assets` | Market assets with prices, AI scores, sector, direction, risk level |
| `signals` | Evidence records linked to assets (type, source, headline, impact) |
| `trades` | Paper trading positions (userId, entry/exit prices, P&L, status) |
| `portfolio` | Virtual balance tracking per user (userId, balance, initialBalance) |
| `daily_briefings` | AI-generated daily intelligence briefings |
| `recommendations` | Individual trade/watch/avoid recommendations linked to briefings |
| `global_events` | Scanned global market events with impact levels |
| `watchlist` | User's watched assets (userId-scoped) |
| `live_trades` | Executed live/paper trades (userId-scoped, platform, AI metadata) |
| `pending_orders` | Orders awaiting user approval (userId-scoped) |
| `radar_alerts` | Market radar alerts (price spikes, volume anomalies, chain reactions) |

---

## Authentication

All API routes except `/api/auth/*` and `/api/healthz` require authentication.

**JWT token delivery:** httpOnly cookie `arclion_token` OR `Authorization: Bearer <token>` header.

**Token expiry:** 7 days.

**Roles:** `admin`, `user`, `tester`

**Auth endpoints:**
```
POST /api/auth/register    — Create account
POST /api/auth/login       — Login, sets cookie
POST /api/auth/logout      — Clear cookie
GET  /api/auth/me          — Current user
POST /api/auth/change-password
```

**For Postman testing:** Login first via POST /api/auth/login, copy the token from the response, add as Bearer token in the Authorization header for all subsequent requests.

---

## Data Sources (8 of 9 active)

| Source | Data | Tier | Env Var |
|--------|------|------|---------|
| CoinGecko | BTC, ETH, SOL prices (10s TTL cache) | Free | — |
| Yahoo Finance | SPY, QQQ, GLD, USO, UNG, EURUSD prices | Free | — |
| Unusual Whales | Options flow, dark pool, congress trades, crypto whales | Paid | `UNUSUAL_WHALES_KEY` |
| Kalshi | Live prediction market prices, Fed cut probability (cumulative across FOMC events) | Free | — |
| NY Fed | Federal funds effective rate (EFFR) | Free | — |
| BLS | CPI (CUUR0000SA0), Unemployment (LNS14000000) | Registered | `BLS_API_KEY` |
| BEA | GDP growth rate (NIPA T10101, LineNumber=1) | Free | `BEA_API_KEY` |
| Alpha Vantage | (optional paid source) | Paid | `ALPHA_VANTAGE_KEY` |
| Benzinga | Planned placeholder — not implemented | Paid | `BENZINGA_API_KEY` |

**Note:** FRED (Federal Reserve Economic Data) is NOT used. Their Terms of Use (updated June 2024) prohibit use with AI/LLM systems.

---

## Engines

| Engine | Schedule | Lock Flag | Description |
|--------|----------|-----------|-------------|
| E1 Market Data | Every 5 min | `isRefreshing` (service-level) | CoinGecko + Yahoo Finance price refresh. Kalshi prediction prices. |
| E6 Intelligence Briefing | Every 30 min | `isScanning` | Claude-powered recommendations (3 trades max, 8 watches max). Includes macro context (BLS/BEA/NY Fed/Kalshi). |
| E7 Live Trading | On-demand | — | Kalshi-priority platform router with risk gates. Per-user credentials. |
| E8 Market Radar | Every 5 min | `isRadarScanning` | 18 assets, 8 chain reaction maps, 30-min alert cooldown, Unusual Whales smart money signals. |

---

## Risk Gate Defaults

All values configurable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MIN_EDGE` | 5 | Minimum edge points to allow trade |
| `MIN_CONFIDENCE` | 65 | Minimum confidence % to allow trade |
| `MAX_POSITION_PCT` | 0.05 | Max position as % of portfolio value |
| `MAX_DAILY_TRADES` | 10 | Max trades per calendar day (UTC) |
| `DAILY_LOSS_LIMIT_PCT` | 0.10 | Daily loss limit as % of portfolio |
| `REQUIRE_APPROVAL` | true | All trades require manual approval |
| `US_JURISDICTION_MODE` | true | Routes to Kalshi, blocks Polymarket |

**Note:** Daily loss limit reads real P&L from trades since UTC midnight. Daily trade count enforced at both execute and approve stages.

---

## Trading Platforms

| Platform | Credentials | Legal Status | Priority |
|----------|-------------|--------------|----------|
| Kalshi | Per-user email + password | CFTC-regulated, US legal | PRIMARY |
| Alpaca | Per-user API key + secret | US stocks/ETFs | SECONDARY |
| Polymarket | Per-user private key | Non-US only | BLOCKED in US mode |

**Architecture:** Each user connects their own trading account via the /settings page. Credentials stored AES-256-GCM encrypted per user in `user_trading_accounts` table. Platform credentials are never exposed in API responses — only connection status (configured/not_configured).

**Fallback:** If no user credentials are configured, trades execute in paper mode.

---

## API Routes

All routes require `Authorization: Bearer <token>` or `arclion_token` cookie except where noted.

### Auth (public)
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/change-password
```

### Markets
```
GET  /api/markets                    — List markets (sector, sort, limit filters)
GET  /api/markets/:id                — Market detail with signals
POST /api/markets/:id/score          — Trigger AI scoring
POST /api/markets/refresh            — Refresh all market data
```

### Signals
```
GET  /api/signals/feed/latest        — Latest signals across all assets
GET  /api/signals/:assetId           — Signals for specific asset
```

### Portfolio (user-scoped)
```
GET  /api/portfolio                  — User's portfolio + open/closed trades
POST /api/portfolio/trade            — Open paper trade
POST /api/portfolio/trade/:id/close  — Close paper trade
GET  /api/portfolio/stats            — Performance statistics
```

### AI Coach
```
POST /api/coach/analyze              — AI coaching (injects live market snapshot + macro context)
```

### Recommendations
```
GET  /api/recommendations/briefing        — Latest intelligence briefing
POST /api/recommendations/scan            — Trigger new AI scan
GET  /api/recommendations/recommendations — List with filters
GET  /api/recommendations/events          — Global market events
GET  /api/recommendations/watchlist       — User's watchlist
POST /api/recommendations/watchlist       — Add to watchlist
DELETE /api/recommendations/watchlist/:id — Remove from watchlist
```

### Live Trading (user-scoped)
```
GET  /api/trading/accounts                — Platform status (per current user's credentials)
GET  /api/trading/route/:recId            — Preview platform routing
POST /api/trading/execute                 — Execute live/paper trade
GET  /api/trading/pending                 — Pending approval orders
POST /api/trading/pending/:id/approve     — Approve order
POST /api/trading/pending/:id/reject      — Reject order
GET  /api/trading/history                 — Trade history
GET  /api/trading/positions               — Open positions
```

### User Settings
```
GET    /api/user/trading-accounts           — User's connected platforms (no raw credentials)
POST   /api/user/trading-accounts           — Connect a platform
DELETE /api/user/trading-accounts/:platform — Disconnect a platform
```

### Radar (E8)
```
GET  /api/radar/alerts              — Recent alerts (hours, type, severity filters)
GET  /api/radar/prices              — Current prices with spike status
POST /api/radar/scan                — Manual radar scan (idempotent lock)
GET  /api/radar/chains/:assetId     — Chain reaction map for asset
GET  /api/radar/chains              — Full cross-asset chain map
GET  /api/radar/thresholds          — Spike detection thresholds
GET  /api/radar/history             — Historical alerts
GET  /api/radar/status              — Engine status and all data sources
GET  /api/radar/macro/bls           — Live BLS CPI + unemployment
GET  /api/radar/macro/bea           — Live BEA GDP growth
GET  /api/radar/prediction-prices   — Live Kalshi prediction market prices
GET  /api/radar/options-flow        — UW options flow as radar signals
GET  /api/radar/dark-pool           — UW dark pool as radar signals
GET  /api/radar/congress            — UW congressional trades as radar signals
GET  /api/radar/crypto-whales       — UW crypto whale transactions as radar signals
```

### Unusual Whales (Smart Money)
```
GET /api/whales/status              — API key configured check
GET /api/whales/flow-alerts         — Live options flow alerts ($500K+ filter)
GET /api/whales/flow-summary        — Aggregated flow summary
GET /api/whales/darkpool            — Dark pool prints ($1M+ filter)
GET /api/whales/darkpool/:ticker    — Dark pool for specific ticker
GET /api/whales/market-tide         — Market Tide net premium flow
GET /api/whales/congress            — Congressional trade disclosures
GET /api/whales/crypto-whales       — Large on-chain transactions ($1M+)
```

### Health (public)
```
GET /api/healthz                    — { status: "ok" }
```

---

## Required Secrets (Replit Secrets / Environment Variables)

| Secret | Required | Description |
|--------|----------|-------------|
| `JWT_SECRET` | Yes | 64-byte random hex. Signs JWT session tokens. |
| `CREDENTIALS_ENCRYPTION_KEY` | Yes | 32-byte random hex. AES-256-GCM encryption key for trading credentials. |
| `UNUSUAL_WHALES_KEY` | Yes | Unusual Whales API key (paid subscription) |
| `BLS_API_KEY` | Yes | BLS registered API key (free at bls.gov/developers) |
| `BEA_API_KEY` | Yes | BEA API key (free at apps.bea.gov/API/signup/) |
| `KALSHI_EMAIL` | Optional | Admin fallback Kalshi credentials (per-user credentials take priority) |
| `KALSHI_PASSWORD` | Optional | Admin fallback Kalshi credentials |
| `ALPACA_API_KEY` | Optional | Admin fallback Alpaca credentials |
| `ALPACA_SECRET_KEY` | Optional | Admin fallback Alpaca credentials |
| `POLYMARKET_PRIVATE_KEY` | Optional | Polymarket (non-US only) |
| `ALPHA_VANTAGE_KEY` | Optional | Alpha Vantage paid data source |
| `BENZINGA_API_KEY` | Optional | Planned — not implemented yet |
| `MIN_EDGE` | Optional | Default: 5 |
| `MIN_CONFIDENCE` | Optional | Default: 65 |
| `MAX_POSITION_PCT` | Optional | Default: 0.05 |
| `MAX_DAILY_TRADES` | Optional | Default: 10 |
| `DAILY_LOSS_LIMIT_PCT` | Optional | Default: 0.10 |
| `REQUIRE_APPROVAL` | Optional | Default: true |
| `US_JURISDICTION_MODE` | Optional | Default: true |

---

## Key Commands

```bash
# Typecheck entire monorepo (always run after changes)
pnpm run typecheck

# Build all packages
pnpm run build

# Push database schema changes
pnpm --filter @workspace/db run push

# Seed sample market data (12 assets, 11 signals)
cd artifacts/api-server && pnpm exec tsx src/seed.ts

# Create admin user account
ADMIN_EMAIL="you@email.com" \
ADMIN_PASSWORD="YourPassword" \
ADMIN_NAME="Your Name" \
pnpm --filter @workspace/api-server exec tsx src/seed-admin.ts

# Regenerate API client after OpenAPI spec changes
cd lib/api-spec && npx orval
cd lib/api-client-react && npx tsc --build
```

---

## Scheduler

Cron jobs in `services/scheduler.ts`:

| Job | Schedule | Lock |
|-----|----------|------|
| Market data refresh | Every 5 minutes | `isRefreshing` in market-data.ts |
| AI recommendations scan | Every 30 minutes | `isScanning` in recommendations.ts |
| Radar scan | Every 5 minutes | `isRadarScanning` in market-radar.ts |
| Initial market refresh | 3 seconds after boot | — |

All locks are module-level variables in their respective service files (not route-level).

---

## Track Record

The 90-day signal accuracy track record started on **Scan #326, April 22, 2026**.

All recommendations from Scan #326 forward are based on live data from all 8 active sources. Track record ends **July 22, 2026**.

---

## Frontend Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | login.tsx | Login page (public) |
| `/register` | register.tsx | Registration (public) |
| `/` | scanner.tsx | Market Scanner — homepage |
| `/briefing` | briefing.tsx | Intelligence Briefing (default after login) |
| `/coach` | coach.tsx | AI Coach with live market context |
| `/portfolio` | portfolio.tsx | User's paper trading portfolio |
| `/radar` | radar.tsx | Market Radar + Smart Money tab |
| `/whales` | whales.tsx | Smart Money — Unusual Whales data |
| `/market/:id` | market-detail.tsx | Asset detail + AI scoring |
| `/settings` | settings.tsx | Password + Trading Account credentials |
| `*` | not-found.tsx | 404 page |

---

## Implementation Notes

- CoinGecko: 10s TTL in-memory cache. Manual refresh always bypasses cache. `dataFreshness` field on every market response.
- Concurrent scan locks are module-level in service files, not route handlers.
- Close trade route: `POST /api/portfolio/trade/:id/close`
- Radar `byType` pre-initialized with all 4 alert types.
- Edge badge threshold: `> 0` (green), `< 0` (red), `= 0` (gray). Uses hardcoded Tailwind classes (not dynamic).
- Mobile: no `overflow-x: hidden` on html/body. Tables wrapped in `overflow-x-auto` containers.
- AI Coach markdown via `react-markdown` + `remark-gfm`. Applied universally across all 5 pages.
- Recommendation sources array populated from `buildSources()` helper based on asset class + macro context.
- Unusual Whales congressional fields: `reporter`, `txn_type`, `amounts`, `filed_at_date`, `transaction_date`, `member_type`.
- Unusual Whales radar-compatible fetchers use `Array.isArray` guards. Endpoints return 503 if `UNUSUAL_WHALES_KEY` not configured.
- Smart money data injected into Claude prompt: top 5 options flow, top 3 dark pool, top 3 congress trades.
- Kalshi Fed cut probability: cumulative across all KXFED events through July 2026. Math: 1 − (∏ hold probabilities per meeting).
- BEA GDP: NIPA T10101, `LineNumber=1`, quarterly frequency, 24h cache.
- BLS data: POST request, series `CUUR0000SA0` (CPI) + `LNS14000000` (unemployment), 24h cache.
- NY Fed EFFR: free public endpoint, no API key. 6h success cache, 2min failure cache.
- Portfolio and all trading data is user-scoped via `userId` FK. Existing rows migrated to admin (userId=3).
- Trading credentials: AES-256-GCM encrypted, never returned in API responses. Only status returned.
- Daily loss: queries `tradesTable` for pnl < 0 since UTC midnight. Per-user via `getDailyPnl(userId)`.
- Daily trade count: enforced at both `executeTrade` and `approvePendingOrder`. Per-user via `getDailyTradeCount(userId)`.

---

## What Is NOT Used (Important for Deployment Team)

- **FRED** — Removed. ToS prohibits AI/LLM use of their data.
- **FastAPI / Python** — Never implemented. Stack is Node.js/TypeScript.
- **Next.js** — Never implemented. Frontend is React + Vite.
- **Benzinga** — Stub only. API not implemented. Shows as "planned" in radar status.
- **Polymarket live trading** — Blocked in US jurisdiction mode. Paper only for US users.

---

*Arclion · AlphaLens Internal Codename · Version 1.0.4-beta · April 2026*
*Confidential — Internal Development Documentation*
