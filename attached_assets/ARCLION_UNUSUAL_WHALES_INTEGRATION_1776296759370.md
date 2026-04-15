# Arclion — Unusual Whales API Integration
## AlphaLens Market Radar Upgrade · April 2026
**Internal codename:** AlphaLens | **Company:** Arclion

---

## What Unusual Whales Adds to AlphaLens

This integration upgrades the E8 Market Radar engine from free-tier
Yahoo Finance volume estimates to institutional-grade signal data:

| Signal Type | Before (free) | After (Unusual Whales) |
|-------------|--------------|----------------------|
| Options flow | Not available | Real-time unusual options activity |
| Dark pool | Not available | Large block off-exchange trades |
| Volume anomaly | 30-day avg comparison (yfinance) | Flagged unusual activity feed |
| Congressional trades | Not available | Senator/Representative buy/sell |
| Crypto whales | Not available | Large on-chain transactions |
| Insider trading | Not available | Corporate insider buy/sell |
| ETF flows | Not available | Institutional inflow/outflow |
| Earnings alerts | Not available | Pre/post market earnings data |

These are the "smart money" signals — when a $50M options bet appears
on SPY before a Fed announcement, or a Senator sells bank stocks before
a bill, AlphaLens will surface it in the Market Radar feed.

---

## READ THIS FIRST — Project Context

This is a pnpm workspace monorepo. Before making any changes:
- API server: `artifacts/api-server/`
- Services: `artifacts/api-server/src/services/`
- Market Radar engine: `artifacts/api-server/src/services/market-radar.ts`
- Always run `pnpm run typecheck` after every change
- Zero TypeScript errors required before any change is complete

**API Key:** Add `UNUSUAL_WHALES_KEY` to Replit Secrets before starting.
**Base URL:** `https://api.unusualwhales.com`
**Auth header:** `Authorization: Bearer YOUR_UNUSUAL_WHALES_KEY`

---

## Integration Architecture

Unusual Whales plugs into the existing E8 Market Radar engine.
The radar already runs every 5 minutes via cron. The integration adds
four new data sources to the existing scan cycle:

```
E8 Market Radar (every 5 min)
├── EXISTING: CoinGecko prices (crypto)
├── EXISTING: Yahoo Finance prices (stocks/commodities)
├── NEW: Unusual Whales options flow alerts
├── NEW: Unusual Whales dark pool trades
├── NEW: Unusual Whales congressional trades
└── NEW: Unusual Whales crypto whale transactions
```

Each new source generates radar alerts that flow into the existing
`radar_alerts` database table and appear on the /radar page.

---

## Step 1 — Add API Key to Replit Secrets

In Replit, click the padlock icon (Secrets) and add:

```
UNUSUAL_WHALES_KEY = your_api_key_here
```

The key is already referenced in `market-radar.ts` as
`process.env.UNUSUAL_WHALES_KEY` — the code checks for it but
currently has no implementation. This step activates it.

---

## Step 2 — Add Unusual Whales Service

**Prompt for Replit AI:**

```
Create a new file: artifacts/api-server/src/services/unusual-whales.ts

This service fetches smart money signals from the Unusual Whales API
and returns them as radar alert objects compatible with the existing
radar_alerts table schema.

Implement the following:

const UW_BASE = "https://api.unusualwhales.com";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.UNUSUAL_WHALES_KEY}`,
    "Content-Type": "application/json",
  };
}

Export these four async functions:

1. fetchOptionsFlowAlerts()
   Endpoint: GET /api/alerts
   Returns alerts flagged as unusual by Unusual Whales algorithm.
   Filter for alerts where premium >= 500000 (half a million USD+).
   Map each to a radar alert object with:
   - type: "volume_anomaly"
   - severity: premium >= 1000000 ? "high" : "medium"
   - assetId: alert ticker (lowercase)
   - assetLabel: alert ticker (uppercase)
   - title: `Unusual options flow: $${(premium/1000000).toFixed(1)}M in ${ticker} ${strike} ${optionType}`
   - direction: optionType === "CALL" ? "bull" : "bear"
   - volumeType: "options_flow"
   - note: Include strike, expiry, premium, and sentiment in a sentence
   - dataSource: "Unusual Whales"

2. fetchDarkPoolAlerts()
   Endpoint: GET /api/darkpool/recent
   Returns recent dark pool (off-exchange) block trades.
   Filter for trades where size >= 1000000 (1M shares or $1M notional).
   Map each to a radar alert object with:
   - type: "volume_anomaly"
   - severity: "medium"
   - assetId: trade ticker (lowercase)
   - assetLabel: trade ticker (uppercase)
   - title: `Dark pool block trade: ${shares} shares of ${ticker} off-exchange`
   - volumeType: "dark_pool"
   - note: Include price, shares, and notional value
   - dataSource: "Unusual Whales Dark Pool"

3. fetchCongressionalTrades()
   Endpoint: GET /api/congress/recent-trades
   Returns recent congressional buy/sell disclosures.
   Map each to a radar alert object with:
   - type: "news_catalyst"
   - severity: "medium"
   - assetId: trade ticker (lowercase)
   - assetLabel: trade ticker (uppercase)
   - title: `Congressional trade: ${politician} ${transactionType} ${ticker}`
   - direction: transactionType includes "Purchase" ? "bull" : "bear"
   - note: Include politician name, party, chamber, amount range, and date
   - dataSource: "Unusual Whales Congress"

4. fetchCryptoWhales()
   Endpoint: GET /api/crypto/whales/recent
   Returns recent large on-chain crypto transactions.
   Filter for transactions >= $1M USD equivalent.
   Map each to a radar alert object with:
   - type: "volume_anomaly"
   - severity: amount >= 10000000 ? "high" : "medium"
   - assetId: "crypto_" + pair.toLowerCase()
   - assetLabel: pair.toUpperCase()
   - title: `Crypto whale: $${(amount/1000000).toFixed(1)}M ${pair} on-chain transaction`
   - volumeType: "crypto_whale"
   - note: Include from/to addresses (truncated), amount, and chain
   - dataSource: "Unusual Whales Crypto"

Error handling for all functions:
- If UNUSUAL_WHALES_KEY is not set, return [] with a console.warn
- If API returns 429, log rate limit warning and return []
- If API returns any other error, log it and return []
- Never throw — always return [] on failure

Run pnpm run typecheck after creating the file. Zero errors required.
```

---

## Step 3 — Integrate Into Market Radar Engine

**Prompt for Replit AI:**

```
In artifacts/api-server/src/services/market-radar.ts, integrate the
new Unusual Whales service into the radar scan cycle:

1. Import the four functions at the top of the file:
   import {
     fetchOptionsFlowAlerts,
     fetchDarkPoolAlerts,
     fetchCongressionalTrades,
     fetchCryptoWhales,
   } from "./unusual-whales";

2. In the main radar scan function (the one called by the cron job),
   after the existing price spike detection and volume anomaly checks,
   add a new section:

   // Unusual Whales smart money signals
   if (process.env.UNUSUAL_WHALES_KEY) {
     const [optionsAlerts, darkPoolAlerts, congressAlerts, cryptoWhales] =
       await Promise.allSettled([
         fetchOptionsFlowAlerts(),
         fetchDarkPoolAlerts(),
         fetchCongressionalTrades(),
         fetchCryptoWhales(),
       ]);

     // Add fulfilled results to the alerts array
     for (const result of [optionsAlerts, darkPoolAlerts, congressAlerts, cryptoWhales]) {
       if (result.status === "fulfilled") {
         newAlerts.push(...result.value);
       }
     }
   }

3. Update the console.log at the end of the scan to include UW data:
   console.log(`Radar scan complete: ${newAlerts.length} alerts
   (${existingCount} price/volume, ${uwCount} smart money)`);

4. Update GET /api/radar/status to show Unusual Whales as active
   when UNUSUAL_WHALES_KEY is set:
   unusual_whales: {
     status: process.env.UNUSUAL_WHALES_KEY ? "active" : "not_configured",
     tier: "paid",
     note: "Options flow, dark pool, congress, crypto whales"
   }

Run pnpm run typecheck after changes. Zero errors required.
```

---

## Step 4 — Add Dedicated API Endpoints

**Prompt for Replit AI:**

```
In artifacts/api-server/src/routes/radar.ts, add four new endpoints
for direct Unusual Whales data access:

1. GET /api/radar/options-flow
   Calls fetchOptionsFlowAlerts() directly and returns the raw results.
   Query params: limit (default 20, max 100)
   Response: { alerts: [...], total: N, source: "Unusual Whales" }

2. GET /api/radar/dark-pool
   Calls fetchDarkPoolAlerts() and returns results.
   Query params: limit (default 20, max 100)
   Response: { trades: [...], total: N, source: "Unusual Whales Dark Pool" }

3. GET /api/radar/congress
   Calls fetchCongressionalTrades() and returns results.
   Query params: limit (default 20, max 100)
   Response: { trades: [...], total: N, source: "Unusual Whales Congress" }

4. GET /api/radar/crypto-whales
   Calls fetchCryptoWhales() and returns results.
   Query params: limit (default 20, max 100)
   Response: { transactions: [...], total: N, source: "Unusual Whales Crypto" }

All four endpoints should:
- Return 503 with message "Unusual Whales not configured — add
  UNUSUAL_WHALES_KEY to Secrets" if the key is not set
- Return empty results with a note if the key is set but API returns no data

Run pnpm run typecheck after changes. Zero errors required.
```

---

## Step 5 — Add Smart Money Tab to /radar Frontend

**Prompt for Replit AI:**

```
In artifacts/alpha-lens/src/pages/radar.tsx, add a new "Smart Money"
tab to the existing /radar page tabs (alongside Live Alerts, Price Monitor,
Data Sources).

The Smart Money tab should show four sub-sections:

1. Options Flow
   - Fetch from GET /api/radar/options-flow
   - Show each alert as a card with: ticker, direction (↑/↓),
     premium size in $M, strike, expiry, and a bull/bear badge
   - Sort by premium descending (largest first)

2. Dark Pool
   - Fetch from GET /api/radar/dark-pool
   - Show each trade as a card with: ticker, shares, price, notional value
   - Badge: "Off-exchange block trade"

3. Congress Trades
   - Fetch from GET /api/radar/congress
   - Show each trade as a card with: politician name, ticker,
     transaction type (Purchase/Sale), amount range, date filed
   - Color: green for Purchase, red for Sale

4. Crypto Whales
   - Fetch from GET /api/radar/crypto-whales
   - Show each transaction with: pair, amount in $M, direction indicator

Add a banner at the top of the Smart Money tab:
"Powered by Unusual Whales — institutional-grade smart money signals"

If UNUSUAL_WHALES_KEY is not configured, show a callout instead:
"Smart Money signals require an Unusual Whales API subscription.
Add UNUSUAL_WHALES_KEY to Replit Secrets to activate."

Run pnpm run typecheck after changes. Zero errors required.
```

---

## Step 6 — Use Unusual Whales in AI Recommendations

**Prompt for Replit AI:**

```
In artifacts/api-server/src/services/recommendations.ts, enhance the
global events scan to include Unusual Whales smart money signals:

When building the context for Claude's recommendation generation,
add a smart money section if UNUSUAL_WHALES_KEY is set:

1. At the start of the recommendations scan, fetch:
   const [optionsFlow, darkPool, congressTrades] = await Promise.allSettled([
     fetchOptionsFlowAlerts(),
     fetchDarkPoolAlerts(),
     fetchCongressionalTrades(),
   ]);

2. Format the top 5 results from each as a text summary:
   const smartMoneySummary = `
   SMART MONEY SIGNALS (Unusual Whales):
   Options Flow: ${top 5 options alerts formatted as one line each}
   Dark Pool: ${top 3 dark pool trades formatted as one line each}
   Congress: ${top 3 congressional trades formatted as one line each}
   `;

3. Include smartMoneySummary in the context passed to Claude when
   generating recommendations, alongside the asset data and global events.

4. Update the recommendations system prompt to mention that smart money
   signals are available and should be cross-referenced when identifying
   trade calls. Example addition to the prompt:
   "When smart money signals are provided, cross-reference them with
   asset data. A large options bet on an asset where AI also shows edge
   is a high-conviction signal."

This makes the AI recommendations aware of institutional activity,
which significantly improves the quality of TRADE CALL generations.

Run pnpm run typecheck after changes. Zero errors required.
```

---

## Verification Checklist

After all steps are complete:

| # | Verification | Pass/Fail |
|---|--------------|-----------|
| 1 | `pnpm run typecheck` — zero errors | |
| 2 | GET /api/radar/status — shows unusual_whales: "active" | |
| 3 | GET /api/radar/options-flow — returns alerts array (not 503) | |
| 4 | GET /api/radar/dark-pool — returns trades array | |
| 5 | GET /api/radar/congress — returns congressional trades | |
| 6 | GET /api/radar/crypto-whales — returns whale transactions | |
| 7 | POST /api/radar/scan — console shows smart money count in log | |
| 8 | GET /api/radar/alerts — includes type: "volume_anomaly" with dataSource: "Unusual Whales" | |
| 9 | /radar page shows Smart Money tab | |
| 10 | Smart Money tab shows options flow, dark pool, congress, crypto sections | |
| 11 | POST /api/recommendations/scan — Claude receives smart money context | |
| 12 | GET /api/recommendations/briefing — recommendations reference institutional activity when relevant | |

---

## Key Unusual Whales Endpoints Reference

For Replit to reference during implementation:

```
Base URL: https://api.unusualwhales.com
Auth: Authorization: Bearer UNUSUAL_WHALES_KEY

Options Flow Alerts:   GET /api/alerts
Dark Pool Recent:      GET /api/darkpool/recent
Dark Pool by Ticker:   GET /api/darkpool/{ticker}
Congress Recent:       GET /api/congress/recent-trades
Congress by Trader:    GET /api/congress/congress-trader
Crypto Whales Recent:  GET /api/crypto/whales/recent
Crypto Whale Txns:     GET /api/crypto/whale-transactions
Insider Transactions:  GET /api/insider/transactions
ETF Inflow/Outflow:    GET /api/etfs/{ticker}/in-outflow
Earnings Premarket:    GET /api/earnings/premarket
Earnings Afterhours:   GET /api/earnings/afterhours
```

---

## MCP Server Note (Optional Future Enhancement)

The screenshot shows Unusual Whales also offers an MCP Server at:
`https://api.unusualwhales.com/api/mcp`

This allows Claude to query Unusual Whales data directly via tool use
during recommendations generation — without pre-fetching in the service.
This is a more advanced integration that can be implemented after the
REST API integration above is working and verified.

To add the MCP server to Claude's recommendations calls:
```typescript
// In recommendations.ts Claude API call, add mcp_servers:
mcp_servers: [{
  type: "url",
  url: "https://api.unusualwhales.com/api/mcp",
  name: "unusual-whales"
}]
```

This gives Claude live access to 18 Unusual Whales tools and 123+
actions during recommendation generation — the AI can query options
flow, dark pool, and congressional data on demand while reasoning.

---

## What This Unlocks for Arclion

After this integration, the Daily Briefing will include signals like:

- "Senator X sold $500K in bank stocks 3 days before SVB news"
- "Unusual $45M put flow on SPY — 3 weeks before Fed meeting"
- "Dark pool block: 2.1M shares of NVDA off-exchange at $142"
- "$180M BTC whale transaction — possible exchange inflow"

These are the signals that sophisticated traders pay thousands per month
to access. Arclion users get them surfaced automatically in the AI
briefing and Market Radar feed.

---

*Arclion · Unusual Whales Integration Guide · Confidential · April 2026*
