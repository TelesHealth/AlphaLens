# Arclion — Live Trading UI
## Pre-UAT Build Sprint · April 2026

Paste this entire document into Replit AI.

---

## Context

The full live trading backend is already built and tested:
- POST /api/trading/execute — executes trades with risk gate
- GET /api/trading/route/:recId — previews platform routing
- GET /api/trading/pending — pending approval orders
- POST /api/trading/pending/:id/approve — approve order
- POST /api/trading/pending/:id/reject — reject order
- GET /api/trading/history — live trade history
- GET /api/trading/positions — open live positions

What is missing: a frontend UI that exposes these endpoints
to users. Currently users can only paper trade through the
UI. Live trading requires direct API calls.

Build a complete Live Trading page and wire live trade
execution into the existing recommendation cards.

---

## STEP 1 — Create the Live Trading page

Create artifacts/alpha-lens/src/pages/trading.tsx

The page has four tabs:
  Overview | Pending Approval | History | Positions

### Tab 1 — Overview

Show platform connection status for the current user.
Call GET /api/trading/accounts.

Display three platform cards: Kalshi, Alpaca, Polymarket.

Each card shows:
  - Platform name and icon
  - Status: Configured (green) / Not configured (gray)
  - Legal status note
  - Asset types covered
  - If not configured: link to /settings to connect

Below the platform cards, show a summary row:
  - Today's trade count vs daily limit
  - Today's P&L (live trades only)
  - Approval mode: ON / OFF

### Tab 2 — Pending Approval

Call GET /api/trading/pending on load.
Poll every 30 seconds for new pending orders.

Show each pending order as a card with:
  - Asset title and direction (bullish/bearish arrow)
  - Platform badge (KALSHI / ALPACA / PAPER)
  - Amount in USD
  - AI probability and edge from the recommendation
  - Routing reason (why this platform was chosen)
  - Time queued (how long it has been waiting)
  - Two buttons: Approve (green) | Reject (red)

On Approve: POST /api/trading/pending/:id/approve
  Show loading state during request.
  On success: remove card, show toast "Trade approved
    and executed"
  On error: show error message on the card

On Reject: POST /api/trading/pending/:id/reject
  Show confirmation: "Reject this trade?" Yes / Cancel
  On confirm: remove card, show toast "Trade rejected"

If no pending orders: show empty state
  "No trades awaiting approval"
  with a note: "Trades will appear here when you
  execute from the Briefing page"

### Tab 3 — History

Call GET /api/trading/history?limit=50.

Show a table with columns:
  Date | Asset | Platform | Direction | Amount |
  AI Prob | Edge | Status

Filter buttons above table:
  All | Kalshi | Alpaca | Paper | Filled | Rejected

Each row is expandable to show:
  - Full routing reason
  - orderId
  - Price at execution
  - Size (units)
  - AI reasoning

Empty state: "No live trades yet. Execute a trade
from the Intelligence Briefing to get started."

### Tab 4 — Positions

Call GET /api/trading/positions.

Show open positions as cards with:
  - Asset name and symbol
  - Platform badge
  - Direction (LONG / YES / SHORT)
  - Entry price
  - Current price (from GET /api/markets)
  - Unrealized P&L (calculated: current - entry × size)
  - Size (units held)
  - Time opened

Color code unrealized P&L:
  Positive: green text
  Negative: red text
  Zero: muted text

Empty state: "No open positions"

---

## STEP 2 — Add Live Trading to the navigation

In artifacts/alpha-lens/src/components/layout.tsx,
add a Trading nav item:

{ href: "/trading", label: "Trading",
  icon: TrendingUp }

Import TrendingUp from lucide-react.

Place it between Portfolio and Radar in the nav:
  Briefing → Scanner → AI Coach → Portfolio →
  Trading → Radar → Smart Money → Settings

---

## STEP 3 — Add route in App.tsx

In artifacts/alpha-lens/src/App.tsx, add:
  import TradingPage from "@/pages/trading"

  <Route path="/trading" component={TradingPage} />

---

## STEP 4 — Wire live trading into Briefing cards

In artifacts/alpha-lens/src/pages/briefing.tsx,
find the RecommendationCard component.

Currently cards only have an Execute Paper Trade button.

Add a second button: Execute Live Trade

The Execute Live Trade button:
  - Only shows when the user has at least one
    trading account configured (check trading accounts
    status — if all platforms show not_configured,
    hide the button and show a tooltip:
    "Connect a trading account in Settings to
    enable live trading")
  - Shows the target platform badge before clicking:
    "Execute via KALSHI" or "Execute via ALPACA"
    Pull this from GET /api/trading/route/:recId

On click — show a confirmation modal:
  Title: "Execute Live Trade"
  Body:
    Asset: [assetTitle]
    Platform: [KALSHI / ALPACA]
    Direction: [YES / LONG / SHORT]
    Amount: [input field, default $50, min $10]
    Routing reason: [from route endpoint]
    Risk gate: All checks will run automatically
    ⚠️ This trade requires your approval before
    executing. You will review it in the Trading
    page before it goes live.
  Buttons: [Confirm] [Cancel]

On Confirm: POST /api/trading/execute
  Body: {
    recommendationId: rec.id,
    amountUsd: enteredAmount,
    overrideApproval: false
  }

  On success (pending_approval):
    Show toast: "Trade queued for your approval.
    Review it in the Trading page."
    Show a badge on the Trading nav item: "1 pending"

  On success (executed immediately if approval off):
    Show toast: "Trade executed on [platform]"

  On error (risk gate blocked):
    Show the specific risk gate reason in the modal:
    "Trade blocked: Edge 3.2 pts below minimum 5 pts"

  On error (platform not configured):
    Show: "Connect your [platform] account in
    Settings to execute live trades."

---

## STEP 5 — Pending badge on nav

In artifacts/alpha-lens/src/components/layout.tsx,
add a live badge to the Trading nav item that shows
the count of pending orders.

On app load and every 60 seconds, call
GET /api/trading/pending and count the results.

If count > 0: show a red badge with the count
next to "Trading" in the nav.
If count = 0: no badge shown.

This tells users at a glance that they have
trades waiting for approval without navigating
to the page.

---

## STEP 6 — Update paper trade button label

In artifacts/alpha-lens/src/pages/briefing.tsx,
update the existing paper trade button label from
"Execute" or "Execute Trade" to "Paper Trade"
so users can clearly distinguish paper vs live.

This prevents confusion between the two buttons.

---

## DESIGN NOTES

Use the existing dark financial terminal aesthetic.
Match the styling of existing pages (briefing.tsx,
portfolio.tsx) for consistency.

Platform badges:
  KALSHI — blue (bg-blue-500/20 text-blue-400)
  ALPACA — green (bg-green-500/20 text-green-400)
  PAPER  — muted (bg-muted text-muted-foreground)

Keep the confirmation modal concise — users should
be able to review and confirm a trade in under
10 seconds.

---

## VERIFICATION

After all steps, verify:

1. pnpm run typecheck — zero errors
2. /trading page loads with 4 tabs
3. Overview tab shows platform connection status
4. Pending tab shows empty state when no pending orders
5. History tab loads trade history
6. Positions tab loads open positions
7. Trading appears in nav between Portfolio and Radar
8. Briefing cards show "Execute Live Trade" button
   when trading account is configured
9. Briefing cards show "Paper Trade" label on
   existing button
10. Clicking Execute Live Trade shows confirmation modal
    with platform, amount input, and routing reason
11. Confirming sends to POST /api/trading/execute
    and shows appropriate toast
12. Pending badge appears on Trading nav item when
    orders are waiting
13. Approving from Pending tab works end to end
