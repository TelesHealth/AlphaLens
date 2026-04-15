# Workspace

## Overview

Alpha Lens — AI-Powered Global Investment Intelligence Platform. pnpm workspace monorepo using TypeScript. Full-stack React + Vite frontend with Express 5 API backend and PostgreSQL database.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + TailwindCSS + Wouter + TanStack React Query v5
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: Anthropic Claude (via Replit AI Integrations proxy)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (API), Vite (frontend)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (port 8080)
│   │   └── src/
│   │       ├── routes/     # markets, signals, portfolio, coach, recommendations, trading, radar, health
│   │       └── services/   # scoring (AI), coach (AI), recommendations (AI), market-data, market-radar, platform-router, scheduler
│   ├── alpha-lens/         # React + Vite frontend (previewPath: /)
│   └── mockup-sandbox/     # Design preview server
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-anthropic-ai/  # Anthropic AI via Replit proxy
├── scripts/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Features

- **Market Scanner**: Real-time market data across crypto (CoinGecko), stocks/commodities/FX (Yahoo Finance), prediction markets (placeholder — ready for live data source)
- **AI Probability Scoring**: Claude-powered analysis with probability scores, edge detection, and risk assessment
- **Paper Trading**: $10,000 virtual balance, open/close positions, P&L tracking
- **AI Coach**: Chat interface for market analysis and trading guidance
- **Evidence Signals**: Structured evidence records with source quality and directional analysis
- **Intelligence Briefing (E6)**: AI-powered daily briefings with trade calls, watch alerts, and global event scanning. 30-min auto-scan via cron.
- **Live Trading (E7)**: Kalshi-priority platform router with risk gates. Supports Kalshi (CFTC-regulated, US legal), Alpaca (stocks/ETFs), and Polymarket (non-US). US jurisdiction mode auto-routes to Kalshi. Pending order approval flow.
- **Market Radar (E8)**: Real-time price spike detection (per-asset thresholds), volume anomaly monitoring (30-day avg comparison), cross-asset chain reaction triggers. 5-min auto-scan via cron. 18 monitored assets, 8 chain reaction maps across energy, crypto, equities, metals, agriculture, FX.

## Data Sources

- **CoinGecko** — crypto prices (BTC, ETH, SOL)
- **Yahoo Finance** — stocks, ETFs, commodities, FX (SPY, QQQ, GLD, USO, UNG, EURUSD). Price change uses indicator close data (5-day range) for accuracy.
- **Prediction markets** — FED-CUT, US-REC, BTC-100K use static placeholder values. Replace `PREDICTION_DEFAULTS` in `services/market-data.ts` with a live API when ready.
- **Unusual Whales** — live options flow alerts, dark pool prints, Market Tide sentiment (requires `UNUSUAL_WHALES_KEY`)
- **Optional paid sources** (add keys to Secrets): `ALPHA_VANTAGE_KEY`, `FINNHUB_KEY`

## Database Schema

- `assets` — Market assets with prices, AI scores, sector, direction, risk level
- `signals` — Evidence records linked to assets (type, source, headline, impact, direction, confidence)
- `trades` — Paper trading positions (entry/exit prices, P&L, status)
- `portfolio` — Virtual balance tracking
- `daily_briefings` — AI-generated daily intelligence briefings with summary and scan metadata
- `recommendations` — Individual trade/watch/avoid recommendations linked to briefings
- `global_events` — Scanned global market events with impact levels and affected assets
- `watchlist` — User's watched assets with alert edge thresholds
- `live_trades` — Executed live/paper trades with platform, price, and AI metadata
- `pending_orders` — Orders awaiting user approval with platform routing reasons
- `radar_alerts` — Market radar alerts (price spikes, volume anomalies, chain reactions) with severity, asset data, and chain links

## API Routes (all under `/api`)

- `GET /markets` — List all markets with sector/sort filters
- `GET /markets/:id` — Market detail with signals and related markets
- `POST /markets/:id/score` — Trigger AI scoring (calls Claude)
- `POST /markets/refresh` — Refresh all market data
- `GET /signals/:assetId` — Get signals for an asset
- `GET /signals/feed/latest` — Latest signals across all assets
- `GET /portfolio` — Portfolio with open/closed trades
- `POST /portfolio/trade` — Open a paper trade
- `POST /portfolio/trade/:id/close` — Close a paper trade
- `GET /portfolio/stats` — Performance statistics
- `POST /coach/analyze` — AI coaching analysis (calls Claude)
- `GET /recommendations/briefing` — Latest AI intelligence briefing
- `POST /recommendations/scan` — Trigger a new AI recommendations scan
- `GET /recommendations/events` — Recent global market events
- `GET /recommendations/watchlist` — Get watchlist items
- `POST /recommendations/watchlist` — Add asset to watchlist
- `DELETE /recommendations/watchlist/:id` — Remove from watchlist
- `GET /trading/accounts` — Platform status (Kalshi/Alpaca/Polymarket) with US jurisdiction info
- `GET /trading/route/:recommendationId` — Preview platform routing decision
- `POST /trading/execute` — Execute a live trade from recommendation
- `GET /trading/pending` — Get pending approval orders
- `POST /trading/pending/:id/approve` — Approve pending order
- `POST /trading/pending/:id/reject` — Reject pending order
- `GET /trading/history` — Live trade history
- `GET /trading/positions` — Open live trading positions
- `GET /radar/alerts` — Recent radar alerts with severity/type filtering
- `GET /radar/prices` — Current prices with spike status for all monitored assets
- `POST /radar/scan` — Manually trigger a radar scan (idempotent lock)
- `GET /radar/chains/:assetId` — Chain reaction map for a specific asset
- `GET /radar/chains` — Full cross-asset chain reaction map
- `GET /radar/thresholds` — Spike detection thresholds for all monitored assets
- `GET /radar/history` — Historical radar alerts (capped at 30 days, 500 limit)
- `GET /radar/status` — Radar engine status and data source availability
- `GET /whales/status` — Check if Unusual Whales is configured
- `GET /whales/flow-alerts` — Live options flow alerts
- `GET /whales/flow-summary` — Aggregated flow summary with top tickers
- `GET /whales/darkpool` — Recent dark pool prints
- `GET /whales/darkpool/:ticker` — Dark pool prints for a specific ticker
- `GET /whales/market-tide` — Market Tide net premium flow over time

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — `pnpm run typecheck`
- **`emitDeclarationOnly`** — only `.d.ts` files; JS bundling by esbuild/vite
- **Project references** — cross-package deps listed in `references`

## AI Integration

Uses `@workspace/integrations-anthropic-ai` which provides an Anthropic client pre-configured with Replit's AI Integrations proxy. No user API key needed — billed to Replit credits. Model: `claude-sonnet-4-6`.

Import: `import { anthropic } from "@workspace/integrations-anthropic-ai"` (not `getAnthropicClient`).

## Codegen Workflow

After editing `lib/api-spec/openapi.yaml`:
1. `cd lib/api-spec && npx orval` (NOT openapi-react-query-codegen)
2. `cd lib/api-client-react && npx tsc --build`

## Seeding

Run `cd artifacts/api-server && pnpm exec tsx src/seed.ts` to seed 12 sample market assets and 11 evidence signals.

## Root Scripts

- `pnpm run build` — typecheck + build all packages
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`

## Key Packages

### `artifacts/alpha-lens` (`@workspace/alpha-lens`)
React + Vite frontend with dark financial terminal aesthetic. Uses generated React Query hooks from `@workspace/api-client-react`. TanStack Query v5 requires `queryKey` in all hook `query` options.

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server. Routes in `src/routes/`, services in `src/services/`. Depends on `@workspace/db`, `@workspace/api-zod`, `@workspace/integrations-anthropic-ai`.

### `lib/db` (`@workspace/db`)
Drizzle ORM with PostgreSQL. Schema in `src/schema/`. Push with `pnpm --filter @workspace/db run push`.

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI spec + Orval config. Codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)
Generated Zod schemas. Note: `GetSignalsParams` is exported as `GetSignalsParamsType` (type alias) to avoid collision with the Zod const of the same name in `generated/api.ts`.

## Trading Platforms

- **Kalshi** — `KALSHI_EMAIL` + `KALSHI_PASSWORD` (CFTC-regulated, US legal)
- **Alpaca** — `ALPACA_API_KEY` + `ALPACA_SECRET_KEY` (stocks/ETFs)
- **Polymarket** — `POLYMARKET_PRIVATE_KEY` (non-US only)
- All default to `not_configured`; trades fall back to paper mode.

## Phase 2 Bug Fixes Applied

- CoinGecko 30s TTL in-memory cache with 429 rate-limit handling
- Concurrent scan locks (recommendations + radar) prevent duplicate scans
- Close trade route fixed: `/portfolio/trade/:id/close`
- Coach AI prompt structured for RECOMMENDATIONS/RISK/CONFIDENCE extraction
- Radar pctChange computed from price history for all assets
- Radar byType pre-initialized with all 3 alert types (price_spike, volume_anomaly, chain_reaction)
- Edge badge threshold: `> 0` (not `> 5`)
- Signal cards click-expandable with chevron toggle
- Watchlist: add from scanner (+/check icon), remove from briefing (trash icon)
- Chain Reactions tab on radar page
- Cache invalidation after AI scoring (markets list refreshed)
- Mobile overflow-x fix (html/body overflow-x hidden + table overflow-x-auto)
- AI Coach markdown rendering via react-markdown
- Neutral direction badge: gray/muted style (not yellow)
- Scan completion toasts with result counts
- Kalshi API key migration TODO documented
- Unusual Whales integration: live options flow, dark pool, Market Tide sentiment chart

## Scheduler

Cron jobs in `services/scheduler.ts`:
- Market data refresh — every 5 minutes
- AI recommendations scan — every 30 minutes
- Radar scan — every 5 minutes
