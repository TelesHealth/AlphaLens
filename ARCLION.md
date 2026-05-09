# ARCLION — AI Investment Intelligence Platform

> Codename **Alpha Lens**. A full-stack, AI-driven investment intelligence platform that ingests live market data, options/dark-pool/congressional flow, macro releases, and Danelfin AI stock scores; runs them through Claude to produce actionable trade calls; routes execution to Kalshi / Alpaca / Polymarket; and continuously self-grades its own track record.

---

## 1. Product Capabilities

ARCLION is an end-to-end "AI portfolio manager":

| Pillar | What it does |
|---|---|
| **Daily Briefing (E6)** | Every 30 minutes Claude scans markets and produces a structured intelligence briefing with `trade`, `watch`, and `avoid` recommendations, each with edge %, conviction score, AI probability, bear case, entry trigger, time window, and source citations. |
| **Market Radar (E8)** | Every 5 minutes a rules-based engine scans 18 monitored assets for price spikes (per-asset thresholds), volume anomalies, cross-asset chain reactions, and smart-money signals. Alerts persist to `radar_alerts` with severity. |
| **Smart Money Feed** | Live Unusual Whales options flow ($500K+ premium), dark-pool prints ($1M+ notional), congressional disclosures, and on-chain crypto whale transactions ($1M+) — surfaced standalone *and* injected into the Claude briefing prompt. |
| **Danelfin AI Score** | Daily 1–10 AI score (with technical / fundamental / sentiment / low-risk sub-scores) for US-listed equities and ETFs. Used as a corroborating signal in Claude's prompt and surfaced as a 5-tier badge in the UI. |
| **Macro Context** | BLS (CPI, unemployment), BEA (GDP), FRED-derived fed funds rate, plus Kalshi prediction-market probabilities for Fed cuts / recession / BTC milestones — all fed into Claude as a macro context block. |
| **AI Coach** | Per-asset chat that answers "should I buy this?" with full context (price, signals, edge, conviction, Danelfin, macro). Markdown-rendered. |
| **Live Trading (E7)** | Kalshi-priority platform router with risk gates. US-jurisdiction mode auto-routes to Kalshi (CFTC-regulated). Falls back to paper mode when no broker is connected. Pending-order approval queue. |
| **Outcome Resolution (E10)** | Daily 09:00 UTC cron that auto-resolves open `trade` calls against truth sources: Kalshi finalized markets, Polymarket closed markets, current asset prices for crypto/equities/FX/commodities, and macro releases for macro recs. Tags `resolutionMethod = auto | manual`. |
| **Adaptive Learning** | Once enough resolved calls accumulate (Stage 1 ≥ 10, Stage 2 ≥ 50, Stage 3 ≥ 200), historical win-rate by sector / direction / confidence bucket is summarized and fed back into the Claude prompt to refine future calls. |
| **Public Leaderboard** | Honest, audited track record: win rate, paper return ($, %), avg edge, avg conviction, calibration buckets, high-conviction vs low-conviction win rate, auto- vs manual-resolved counts, and explicit eligible/excluded paper-return counts so legacy calls without verified entry prices don't pollute P&L. |
| **Watchlist** | Per-user asset watchlist with edge alert thresholds. |
| **Paper Portfolio** | $10,000 virtual balance, open/close positions, realized & unrealized P&L. |

---

## 2. Repository Layout

```
arclion/
├── artifacts/
│   ├── api-server/          @workspace/api-server   Express 5 API (port 8080, path /api)
│   ├── alpha-lens/          @workspace/alpha-lens   React + Vite frontend (path /)
│   └── mockup-sandbox/      @workspace/mockup-sandbox  Component preview server
├── lib/
│   ├── api-spec/            OpenAPI 3.0 spec + Orval codegen config
│   ├── api-client-react/    Generated TanStack Query hooks
│   ├── api-zod/             Generated Zod runtime schemas
│   ├── db/                  Drizzle ORM schema + Postgres connection
│   └── integrations-anthropic-ai/  Anthropic Claude client (Replit AI proxy)
├── scripts/
└── pnpm-workspace.yaml
```

**Stack**: Node 24 · pnpm workspaces · TypeScript 5.9 (composite project references) · Express 5 · React 18 + Vite + Tailwind + Wouter + TanStack Query v5 · PostgreSQL + Drizzle ORM · Zod v4 · Orval codegen · esbuild (API) · Vite (frontend) · Anthropic Claude (model: `claude-sonnet-4-6`).

---

## 3. Database Schema (PostgreSQL via Drizzle)

### `users`
Authenticated accounts. `email` unique, `passwordHash` (bcrypt), `role` (`user` | `admin`), `isActive`, `lastLoginAt`.

### `user_trading_accounts`
Per-user encrypted broker credentials (`platform`, `encryptedCredentials`, `status`). Unique per `(userId, platform)`. Encrypted at rest with `CREDENTIALS_ENCRYPTION_KEY`.

### `assets`
Tracked instruments — crypto, equities, ETFs, commodities, FX, prediction markets.
Key fields: `name`, `symbol`, `sector`, `currentPrice`, `priceChange24h`, `alphaScore`, `aiProbability`, `marketProbability`, `edge`, `direction`, `lastScoredAt`, `aiSummary`, `tradingBloc`, `riskLevel`, `description`, `region`, `tags`.

### `signals`
Evidence records linked to an asset. `type` (fundamental | technical | flow | macro), `source`, `headline`, `detail`, `impact` (low/medium/high), `direction` (bullish/bearish/neutral), `confidence` (0–1).

### `daily_briefings`
One row per scan cycle. `summary`, `tradeCount`, `watchCount`, `signalsProcessed`, `scanNumber`, `generatedAt`.

### `recommendations` *(the central table)*
Foreign-keyed to `daily_briefings`. One row per call.

| Column | Purpose |
|---|---|
| `type` | `trade` \| `watch` \| `avoid` |
| `urgency` | `low` \| `medium` \| `high` |
| `title`, `assetId`, `assetTitle`, `assetClass`, `sector`, `region` | Identity |
| `direction` | `LONG` / `SHORT` / `YES` / `NO` / `WATCH` |
| `aiProbability` | Claude's probability (0–100) |
| `marketPrice` | Live price at call time (legacy field — see paperReturn note) |
| `assetPriceAtCall` | Verified asset entry price; populated from `Apr 2026` onward |
| `edge`, `edgeType`, `convictionScore` | Edge math (see §6) |
| `edgeCalculatedAt`, `edgeExplanation`, `confidenceRationale` | Edge audit trail |
| `edgePrevious`, `edgeChangedAt` | Edge drift detection |
| `taSignal` (jsonb) | Technical-analysis snapshot |
| `danelfinScore` (jsonb) | `{date, ticker, aiScore, technical, fundamental, sentiment, lowRisk, signal}` |
| `headline`, `why` (jsonb), `historicalContext`, `bearCase`, `entryTrigger` | Claude narrative |
| `confidence` (0–100), `window`, `urgencyReason` | Sizing + timing |
| `sources` (jsonb) | `["CoinGecko", "Unusual Whales", "Danelfin", ...]` |
| `outcome` | `correct` \| `incorrect` \| `partial` \| `null` (open) |
| `resolutionDate`, `resolutionNote`, `marketPriceAtResolution`, `paperReturn` | Resolution audit |
| `resolutionMethod` | `auto` \| `manual` |

### `global_events`
Macro/geopolitical events surfaced by the scanner. `title`, `region`, `impactLevel`, `detail`, `affectedAssets` (jsonb), `direction`, `timeContext`.

### `watchlist`
Per-user watched assets with `alertEdgeThreshold`.

### `trades`
Paper-portfolio positions. `direction`, `entryPrice`, `exitPrice`, `quantity`, `pnl`, `pnlPercent`, `status`, `aiReasoning`.

### `portfolio`
Per-user $10,000 virtual balance (unique on `userId`).

### `live_trades`
Executed live or paper-routed trades. `platform`, `assetId`, `direction`, `amountUsd`, `price`, `size`, `status`, `paperMode`, `aiProbability`, `aiEdge`, `confidence`, `orderId`, `ticker`.

### `pending_orders`
Trades awaiting user approval (router emitted them but they haven't been confirmed). `recTitle`, `platform`, `platformReason`, `status` (`pending_approval` | `approved` | `rejected`).

### `radar_alerts`
Time-series alert log. `type` (`price_spike` | `volume_anomaly` | `chain_reaction` | `smart_money`), `severity`, `assetId`, `pctChange`, `direction`, `priceStart`, `priceNow`, `windowMinutes`, `thresholdPct`, `volumeMultiplier`, `volumeType`, `confidence`, `triggerAsset`, `triggerPct`, `chainAssets` (jsonb), `historicalNote`, `aiScanning`, `dataSource`. Indexed on `(createdAt)`, `(type, createdAt)`, `(severity, createdAt)`.

---

## 4. Backend Services (`artifacts/api-server/src/services/`)

### `auth.ts`
Bcrypt-hashed passwords, JWT (HS256) with 7-day expiry signed by `SESSION_SECRET`. Cookie + `Authorization: Bearer` both supported. Admin role gate for sensitive endpoints.

### `market-data.ts`
- **Refresh loop** every 5 min via `refreshAllMarketData()`.
- Sources: CoinGecko (BTC, ETH, SOL — 30s in-memory cache, 429-aware), Yahoo Finance (SPY, QQQ, GLD, USO, UNG, EURUSD, etc. — 5-day indicator close range for accurate change %), Kalshi prediction markets (FED-CUT, US-REC, BTC-100K via aggregated event probability).
- Optional: Alpha Vantage, Finnhub, Benzinga (gated on env keys).
- **Edge refresh** also runs each cycle: re-prices open recommendations and writes `edge`, `convictionScore`, `edgeCalculatedAt` so the briefing reflects fresh edge.

### `recommendations.ts`
The orchestrator behind the daily briefing.

1. Pulls fresh asset snapshots, signals, smart-money flow, macro context, and Danelfin scores (eligible tickers only — equities/metals/energy).
2. Builds an extensive Claude prompt: system rules + market state + smart-money block (top 5 options flow / 3 dark pool / 3 congress) + macro block + Danelfin AI scores block + adaptive-learning block (track-record summary).
3. Calls Claude (`claude-sonnet-4-6`) with strict JSON schema for structured output.
4. Validates and persists each recommendation, including computed `edge`, `edgeType`, `convictionScore`, `assetPriceAtCall`, source list, Danelfin snapshot.
5. Emits new `daily_briefings` row + N `recommendations` rows.

Concurrent scans are gated by an in-process `scanLock` so the cron and manual `POST /api/recommendations/scan` cannot collide.

### `scoring.ts`
Standalone per-asset Claude scoring (`POST /api/markets/:id/score`). Produces `aiProbability`, `direction`, `edge`, `riskLevel`, `aiSummary`.

### `coach.ts`
AI Coach — assembles a per-asset context bundle (price, signals, edge, Danelfin, macro) and calls Claude conversationally. Markdown response.

### `market-radar.ts`
- `SPIKE_THRESHOLDS`: per-asset config of `windowMinutes` and `thresholdPct` (e.g. BTC ±3% in 30min, USO ±2% in 30min, GLD ±1% in 60min).
- `CHAIN_REACTIONS`: 8 cross-asset maps (e.g. USO spike → UNG, USDCAD, energy equities; BTC → ETH, SOL).
- `runRadarScan()`: idempotent (DB-locked), emits `radar_alerts` rows, never throws on partial source failure.
- `getPriceMonitor()` exposes spike status per monitored asset.
- `getRadarStatus()` lists all 10 data sources with `active | planned` + tier labels.

### `unusual-whales.ts`
Wraps the Unusual Whales API (`UNUSUAL_WHALES_KEY`). Endpoints: flow alerts (premium ≥ $500K), dark-pool prints (notional ≥ $1M), Market Tide (net premium time-series), congressional trades, on-chain crypto whales. Also returns radar-compatible shapes for the radar UI.

### `kalshi-markets.ts`
Pulls live Kalshi event-series prices and aggregates per-event probabilities (e.g. cumulative "Fed cuts before July 2026").

### `macro-data.ts`
- **BLS** (`BLS_API_KEY`): CPI + unemployment.
- **BEA** (`BEA_API_KEY`): quarterly GDP, 24h cache.
- **Fed funds rate**: derived from Kalshi KXFED contract probabilities.
- `fetchMacroContext()` returns a markdown block injected into Claude.

### `danelfin.ts`
- **API**: `GET https://apirest.danelfin.com/ranking?ticker=X` with `x-api-key`.
- **Cache**: 24h per-ticker in-memory; stores `null` results too to avoid hammering on unknown tickers.
- **Eligibility**: `equities | metals | energy` only — excludes `crypto`, `prediction`, `fx`, `forex`.
- **Signal mapping**: `aiScore ≥ 8 → strong_buy`, `≥ 6 → buy`, `= 5 → neutral`, `≤ 3 → sell`, `≤ 2 → strong_sell`, else `hold`.
- **Batch**: `getDanelfinScores()` uses `Promise.allSettled` — never throws.
- **Prompt context**: `formatDanelfinContext()` produces a structured block with rules ("≥7 bullish on a LONG → +10 confidence; ≤3 conflict on a LONG → add bearCase").

### `platform-router.ts`
- Decides where a recommendation should execute: `kalshi | polymarket | alpaca | paper`.
- US jurisdiction mode auto-routes to Kalshi for prediction-style calls (CFTC-regulated, US-legal).
- `KALSHI_STRONG` and `POLYMARKET_ONLY` keyword maps trigger venue selection.
- **Risk gates**: daily P&L cap, daily trade-count cap, max pending orders.
- Stores pending orders for user approval; logs filled trades to `live_trades`.

### `outcome-resolver.ts`
Daily resolver. Categorizes each open trade rec by `derivePlatform()` → `kalshi | polymarket | price | economic`. Uses:
- Kalshi finalized markets (per-process cache eliminates 429 storms).
- Polymarket closed markets via Gamma API.
- Live asset prices for crypto/equities/FX/commodities (`marketPriceAtResolution`).
- BLS/BEA/Fed releases for macro recs.
Computes `paperReturn` from `assetPriceAtCall` → `marketPriceAtResolution`. Emits a digest: `{ resolved, stillOpen, approachingWindow (≤7d), needsReview }`.

### `adaptive-learning.ts`
Builds a learning summary from resolved recs:
- Stage 1 (≥10 resolved): basic win rate, by sector, by direction.
- Stage 2 (≥50): adds confidence-bucket calibration.
- Stage 3 (≥200): adds edge-decile and conviction-decile performance.
The summary is appended to the Claude briefing prompt to encourage self-correction.

### `scheduler.ts`
`node-cron` jobs, each guarded by an in-process lock:
- Market data refresh — every 5 min.
- Recommendations scan — every 30 min.
- Radar scan — every 5 min.
- Outcome resolution — daily 09:00 UTC.

---

## 5. AI / LLM Architecture

### Provider
`@workspace/integrations-anthropic-ai` exports a pre-configured `anthropic` client routed through Replit's AI Integrations proxy — no user API key required, billed to Replit credits. Model: **`claude-sonnet-4-6`**.

### Prompt anatomy (recommendations scan)

```
SYSTEM: You are ARCLION, a disciplined AI portfolio manager...
        - Output strictly conforms to schema X
        - Use MACRO and SMART MONEY context to inform calls
        - Danelfin: aiScore ≥7 bullish on LONG → +10 confidence; ≤3 → bearCase
        - Adaptive learning: weight prior win-rate per sector

USER:   MARKET STATE
        ============
        SPY  $737.62  (+0.83%)  edge +12.4  conviction 18
        ...

        SMART MONEY (top 5 flow / 3 dark pool / 3 congress)
        ===================================================
        ...

        MACRO CONTEXT
        =============
        CPI YoY 2.4% (Apr 2026) · Unemployment 4.1% · GDP +2.8% QoQ
        Fed funds 3.75% · Kalshi cum. cut prob by Jul 16%
        ...

        DANELFIN AI SCORES
        ==================
        SPY: AI 8 (strong_buy) · T 9 / F 5 / S 7 / LR 7
        QQQ: AI 8 (strong_buy) · T 7 / F 3 / S 8 / LR 6
        ...

        ADAPTIVE LEARNING (Stage 2, 67 resolved)
        ========================================
        Overall win rate: 54%  ·  Crypto LONG: 48%  ·  Energy SHORT: 71%
        High-conviction (>15) win rate: 64%
        ...

        Produce a JSON briefing with trade/watch/avoid recommendations.
```

### AI surfaces beyond the briefing

| Endpoint | Purpose |
|---|---|
| `POST /api/markets/:id/score` | One-shot Claude scoring of a single asset. |
| `POST /api/coach/analyze` | Conversational coach with full asset context, markdown reply. |
| `POST /api/recommendations/scan` | Manually trigger the briefing pipeline. |

### Edge calculation (asset-class-aware)

| Class | `marketPrice` is | `edge` formula |
|---|---|---|
| Prediction market | Implied probability (0–100) | `aiProbability − marketProbability` |
| Crypto / Equity / Commodity / FX | Dollar price | `aiProbability − 50` (vs neutral) |

`convictionScore = abs(edge) × confidence/100 × directionWeight`

`edgeType` records which formula was used. `edgeCalculatedAt` enables freshness dots in the UI. Open recs are re-priced every 5 min by `refreshRecommendationEdges()`.

---

## 6. REST API Surface (`/api`)

> All endpoints (except `/api/healthz`, `/api/auth/*`) require auth via cookie or `Bearer` JWT.

### Auth
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Markets & Signals
- `GET /api/markets` — list with `sector`/`sort` filters
- `GET /api/markets/:id` — detail + signals + related
- `POST /api/markets/:id/score` — Claude score
- `POST /api/markets/refresh` — refresh all
- `GET /api/signals/:assetId`
- `GET /api/signals/feed/latest`

### Recommendations & Briefing
- `GET /api/recommendations/briefing` — current briefing + recs + sources
- `POST /api/recommendations/scan` — trigger fresh scan
- `GET /api/recommendations/events` — global events
- `GET /api/recommendations/watchlist` · `POST /api/recommendations/watchlist` · `DELETE /api/recommendations/watchlist/:id`
- `PATCH /api/recommendations/:id/outcome` — admin manual resolution
- `POST /api/recommendations/resolve-outcomes` — admin trigger daily resolver

### Portfolio (paper)
- `GET /api/portfolio` · `GET /api/portfolio/stats`
- `POST /api/portfolio/trade` · `POST /api/portfolio/trade/:id/close`

### Live Trading
- `GET /api/trading/accounts` — per-platform configured/connected status
- `GET /api/trading/route/:recommendationId` — preview routing decision + risk gate
- `POST /api/trading/execute` · `GET /api/trading/pending` · `POST /api/trading/pending/:id/approve|reject`
- `GET /api/trading/history` · `GET /api/trading/positions`
- `POST /api/trading/credentials` — encrypted broker credential storage

### Coach
- `POST /api/coach/analyze`

### Market Radar
- `GET /api/radar/status` — engine + 10 data sources
- `GET /api/radar/alerts` · `GET /api/radar/history`
- `GET /api/radar/prices` · `GET /api/radar/thresholds`
- `GET /api/radar/chains` · `GET /api/radar/chains/:assetId`
- `POST /api/radar/scan` — manual idempotent scan
- `GET /api/radar/options-flow` · `/dark-pool` · `/congress` · `/crypto-whales` (radar-compatible)

### Unusual Whales
- `GET /api/whales/status`
- `GET /api/whales/flow-alerts` · `GET /api/whales/flow-summary`
- `GET /api/whales/darkpool` · `GET /api/whales/darkpool/:ticker`
- `GET /api/whales/market-tide`
- `GET /api/whales/congress`
- `GET /api/whales/crypto-whales`

### Leaderboard (public-style)
- `GET /api/leaderboard` — stats + calibration buckets + recommendations list. Stats include:
  - `winRate`, `winRateWithPartial`, `avgEdge`, `avgAiProbability`, `avgConvictionScore`
  - `highConvictionWinRate` (>15), `lowConvictionWinRate` (<10)
  - `highConfidenceWinRate` (>75), `highEdgeWinRate` (>20)
  - `totalPaperReturn`, `paperReturnPct`, `paperReturnEligibleCalls`, `paperReturnExcludedCalls`, `paperReturnReliability`
  - `autoResolved`, `manualResolved`, `pendingResolution`, `byType { trade, watch, avoid }`

### Health
- `GET /api/healthz`

---

## 7. Frontend (`artifacts/alpha-lens`)

React + Vite + TailwindCSS, dark "financial terminal" aesthetic, served at `/`.

| Page | Capability |
|---|---|
| `briefing.tsx` | Daily AI briefing — recommendation cards with edge badge, conviction score, freshness dot, Danelfin badge (5-tier), bear case, entry trigger, sources. One-click "Open trade" → routes through risk gate to broker or paper. |
| `scanner.tsx` | All assets table with sortable columns: alpha score, AI probability, edge, conviction, Danelfin signal. Click-through to market detail. |
| `market-detail.tsx` | Per-asset deep-dive — price, signals, AI summary, score history, related markets. |
| `coach.tsx` | Per-asset chat with the AI coach; markdown rendered. |
| `portfolio.tsx` | Paper portfolio: balance, open trades with live P&L, closed trade history. |
| `trading.tsx` | Live trading: connected platforms, pending orders awaiting approval, live positions, trade history. |
| `radar.tsx` | Market Radar dashboard: live alerts, monitored assets with spike status, chain-reaction maps, Smart Money tab. |
| `whales.tsx` | Unusual Whales: Options Flow / Dark Pool / Market Tide / Congress / Crypto Whales tabs. |
| `leaderboard.tsx` | Public track record: win-rate hero, paper return with eligible/excluded transparency, calibration buckets, conviction win-rate breakdown. |
| `settings.tsx` | Account + encrypted broker credentials. |
| `login.tsx` / `register.tsx` | Email/password auth. |

All API calls go through generated TanStack Query hooks from `@workspace/api-client-react` (Orval-generated). Validation via `@workspace/api-zod`.

---

## 8. External Data Sources

| Source | Status | Auth | Use |
|---|---|---|---|
| **CoinGecko** | Active (free) | none | Crypto prices BTC/ETH/SOL, 30s TTL cache, 429-aware |
| **Yahoo Finance** | Active (free) | none | Stocks, ETFs, commodities, FX (15-min delayed) |
| **Unusual Whales** | Active (paid) | `UNUSUAL_WHALES_KEY` | Options flow, dark pool, congress, crypto whales |
| **Kalshi** | Active (free) | optional `KALSHI_EMAIL`+`KALSHI_PASSWORD` for trading | Prediction-market prices + outcome resolution |
| **Polymarket** | Active | optional `POLYMARKET_PRIVATE_KEY` | Prediction-market resolution + non-US trading |
| **Alpaca** | Active | optional `ALPACA_API_KEY`+`ALPACA_SECRET_KEY` | US stock/ETF live trading |
| **Danelfin** | Active (paid) | `DANELFIN_API_KEY` | AI stock scores 1–10 (US equities/ETFs only, 24h cache) |
| **BLS** | Active (registered) | `BLS_API_KEY` | CPI + unemployment (500 calls/day) |
| **BEA** | Active (free) | `BEA_API_KEY` | Quarterly GDP, 24h cache |
| **Alpha Vantage** | Optional | `ALPHA_VANTAGE_KEY` | Real-time commodity prices |
| **Finnhub** | Optional | `FINNHUB_KEY` | News-catalyst detection |
| **Benzinga** | Planned | `BENZINGA_API_KEY` | Real-time news sentiment |

---

## 9. Codegen & Type Safety

- **Source of truth**: `lib/api-spec/openapi.yaml`.
- **Generated artifacts** (`pnpm --filter @workspace/api-spec run codegen`):
  - `lib/api-client-react/src/generated/` — TanStack Query hooks + TS interfaces.
  - `lib/api-zod/src/generated/` — Runtime Zod validators.
- **Composite TypeScript projects**: every package extends `tsconfig.base.json` (`composite: true`); the root `tsconfig.json` lists all packages as references. Always `pnpm run typecheck` from root.
- **DB schema → Drizzle types** flow directly into the API server; OpenAPI defines the public contract independently so frontend never imports DB types.

---

## 10. Security

- **Passwords**: bcrypt.
- **Sessions**: HS256 JWT signed by `SESSION_SECRET`, 7-day expiry. Cookie-based default with `Bearer` fallback.
- **Broker credentials**: AES-encrypted at rest using `CREDENTIALS_ENCRYPTION_KEY`, stored per-user in `user_trading_accounts`.
- **Admin gate**: `role = 'admin'` required for outcome override, manual resolution trigger, and any destructive ops.
- **Risk gates** (live trading): daily P&L cap, daily trade-count cap, pending-order ceiling; all enforced server-side in `platform-router.ts`.
- **Rate limit awareness**: CoinGecko 429-handling + 30s TTL; Kalshi per-process cache during outcome resolution.

---

## 11. Environment Variables

Required:
- `DATABASE_URL` — Postgres connection.
- `SESSION_SECRET` — JWT signing.
- `CREDENTIALS_ENCRYPTION_KEY` — Broker credential encryption.

Strongly recommended:
- `UNUSUAL_WHALES_KEY` · `DANELFIN_API_KEY` · `BLS_API_KEY` · `BEA_API_KEY`

Optional (live trading):
- `KALSHI_EMAIL` + `KALSHI_PASSWORD`
- `ALPACA_API_KEY` + `ALPACA_SECRET_KEY`
- `POLYMARKET_PRIVATE_KEY`

Optional (extra data):
- `ALPHA_VANTAGE_KEY` · `FINNHUB_KEY` · `BENZINGA_API_KEY`

---

## 12. Operations

### Workflows
- `artifacts/api-server: API Server` → `pnpm --filter @workspace/api-server run dev` (port 8080, path `/api`).
- `artifacts/alpha-lens: web` → `pnpm --filter @workspace/alpha-lens run dev` (Vite, path `/`).
- `artifacts/mockup-sandbox: Component Preview Server` → `pnpm --filter @workspace/mockup-sandbox run dev`.

### Scheduled Jobs
| Job | Cadence | Implementation |
|---|---|---|
| Market data refresh | every 5 min | `safeRefresh` → `refreshAllMarketData()` |
| Recommendations scan | every 30 min | `safeScan` → `scanForRecommendations()` |
| Radar scan | every 5 min | `runRadarScan()` (DB-locked) |
| Outcome resolution | daily 09:00 UTC | `safeOutcomeResolution` → `runOutcomeResolution()` |

### Common commands
```bash
pnpm install
pnpm run typecheck                                  # composite root typecheck
pnpm --filter @workspace/db run push                 # apply schema
pnpm --filter @workspace/api-spec run codegen        # regenerate API client + zod
pnpm --filter @workspace/api-server run dev          # API only
pnpm --filter @workspace/alpha-lens run dev          # frontend only
pnpm run build                                       # typecheck + build all
```

---

## 13. Notable Design Decisions

- **Honest leaderboard**: legacy resolved calls without `assetPriceAtCall` are excluded from `totalPaperReturn` math but still count toward win/loss rate. UI surfaces `paperReturnEligibleCalls` / `paperReturnExcludedCalls` so users see exactly what the dollar number is based on. No fabricated entry prices.
- **Edge freshness**: every recommendation carries `edgeCalculatedAt`; the briefing UI shows a freshness dot, and a 5-min refresher keeps open recs current.
- **Single source of truth for signal mapping**: the Danelfin badge in the UI uses backend-provided `signal` (not a local re-derivation) so boundary scores can never drift.
- **Concurrent-scan locks**: every scheduled job has both an in-process lock and (for radar) a DB-level lock so manual triggers and cron runs cannot duplicate work.
- **Per-process Kalshi cache** during outcome resolution prevents 429 storms when many recs reference the same finalized event.
- **Asset-class-aware edge math** so prediction-market probability calls and dollar-price calls don't get mixed in aggregate stats.
- **Adaptive learning is staged**: the Claude prompt only sees historical priors once a meaningful number of resolved calls has accumulated, avoiding overfitting to noise.
- **AI never silently fails**: every external call is wrapped in `try/catch` with explicit logging; missing keys produce typed `null`, not exceptions.
