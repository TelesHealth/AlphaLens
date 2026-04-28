# Arclion — Signal Accuracy Leaderboard
## Replit Build Prompt · April 2026

Paste this entire document into Replit AI.

---

## Context

The recommendations table already has an `outcome` field
that is null on all new recommendations. The Signal Tracker
role manually updates this field as events resolve.

Build a public Signal Accuracy Leaderboard page that reads
from the recommendations table and displays the 90-day
track record in a compelling, transparent format.

This page is public — it does not require authentication.
It is the platform's most important marketing page.

---

## STEP 1 — Update the recommendations schema

In lib/db/src/schema/, find the recommendations table.

Add these fields if they don't exist:

  outcome: varchar(20)
    — values: "correct", "incorrect", "partial", null
    — null = not yet resolved

  resolutionDate: timestamp nullable
    — when the event resolved

  resolutionNote: text nullable
    — brief explanation of the outcome
    — e.g. "Fed cut 25bps at July FOMC meeting"

  marketPriceAtResolution: numeric nullable
    — the market price when the event resolved

  paperReturn: numeric nullable
    — hypothetical return on a $100 paper trade
    — positive = profit, negative = loss

Run: pnpm --filter @workspace/db run push

---

## STEP 2 — Add outcome update endpoint

In artifacts/api-server/src/routes/recommendations.ts,
add a new endpoint (admin only):

PATCH /api/recommendations/:id/outcome
  Requires: requireAdmin middleware

  Body: {
    outcome: "correct" | "incorrect" | "partial",
    resolutionDate: ISO date string,
    resolutionNote: string,
    marketPriceAtResolution?: number,
    paperReturn?: number
  }

  Updates the recommendation row with the outcome data.
  Returns the updated recommendation.

This allows the Signal Tracker to update outcomes
via Postman or a simple admin interface.

---

## STEP 3 — Add leaderboard API endpoint

In artifacts/api-server/src/routes/recommendations.ts,
add a PUBLIC endpoint (no auth required):

GET /api/leaderboard
  Query params:
    limit — number, max 100, default 50
    type — "trade" | "watch" | "avoid" | "all"
    status — "resolved" | "open" | "all"

  Returns:

  {
    stats: {
      trackRecordStart: "2026-04-22",
      trackRecordEnd: "2026-07-22",
      daysElapsed: N,
      daysRemaining: N,
      totalCalls: N,
      resolvedCalls: N,
      openCalls: N,
      correctCalls: N,
      incorrectCalls: N,
      partialCalls: N,
      winRate: N,              // percentage, rounded to 1 decimal
      winRateWithPartial: N,   // counting partial as 0.5 wins
      avgEdge: N,              // average edge across all calls
      avgAiProbability: N,     // average AI probability assigned
      totalPaperReturn: N,     // sum of paperReturn field in dollars
      paperReturnPct: N,       // total return as % of capital deployed
      highConfidenceWinRate: N, // win rate on calls with confidence > 0.75
      highEdgeWinRate: N,       // win rate on calls with edge > 20
    },
    calibration: [
      // Group resolved calls by AI probability bucket
      { bucket: "60-69%", calls: N, correct: N, rate: N },
      { bucket: "70-79%", calls: N, correct: N, rate: N },
      { bucket: "80%+",   calls: N, correct: N, rate: N },
    ],
    recommendations: [
      // The actual calls — resolved first, then open
      {
        id, type, title, assetTitle, assetClass,
        direction, aiProbability, marketPrice, edge,
        confidence, urgency, window,
        outcome, resolutionDate, resolutionNote,
        marketPriceAtResolution, paperReturn,
        createdAt
      }
    ]
  }

Make this endpoint public — no requireAuth.
Add to the route list as public alongside /api/auth/*
and /api/healthz.

---

## STEP 4 — Create the leaderboard page

Create artifacts/alpha-lens/src/pages/leaderboard.tsx

This is a PUBLIC page — no auth required.
Add it to App.tsx as a public route alongside /login.

The page has three sections:

### Section A — Hero stats bar

A prominent stats bar at the top showing:

  [Track Record: Day N of 90]
  [Win Rate: X%]  [Calls Made: N]  [Resolved: N]
  [Paper Return: +$X]  [Avg Edge: X pts]

Use large numbers with color coding:
  Win rate > 60%: green
  Win rate 50-60%: amber
  Win rate < 50%: red

Paper return positive: green with + sign
Paper return negative: red with - sign

Show the track record period:
  "April 22, 2026 — July 22, 2026"
  with a progress bar showing days elapsed

### Section B — Calibration chart

A simple bar chart (use recharts) showing
edge accuracy by probability bucket:

  AI said 60-69% → actual win rate X%
  AI said 70-79% → actual win rate X%
  AI said 80%+   → actual win rate X%

Add a diagonal reference line at y=x
(perfect calibration line).

Title: "Is the AI calibrated? (predicted vs actual)"

Only show this section when there are at least
10 resolved calls.

### Section C — Recommendations table

A filterable table of all recommendations.

Filter tabs: All | Open | Correct | Incorrect

Columns:
  Date | Asset | Direction | AI Prob | Market | Edge |
  Confidence | Status | Outcome | Paper Return

Row styling:
  Correct: subtle green left border
  Incorrect: subtle red left border
  Open: no border, muted opacity
  Partial: subtle amber left border

Each row is expandable to show:
  Resolution note (what actually happened)
  Market price at resolution vs entry
  Time from call to resolution

Sort: resolved calls first (newest resolution first),
then open calls (newest call first).

### Section D — Sharing CTA

At the bottom of the page:

  "The full track record is public and verifiable.
   Every call is logged the moment the AI makes it.
   No cherry-picking. No retroactive changes."

  [View Intelligence Briefing →] button
  (links to /briefing, requires login)

---

## STEP 5 — Add leaderboard to navigation

In artifacts/alpha-lens/src/components/layout.tsx,
add a Leaderboard nav item:

{ href: "/leaderboard", label: "Track Record",
  icon: BarChart2 }

Import BarChart2 from lucide-react.

Place it between Briefing and Scanner:
  Briefing → Track Record → Scanner → AI Coach...

Note: This nav item should be visible even when
the user is not logged in. The leaderboard page
is public.

---

## STEP 6 — Add public route in App.tsx

In artifacts/alpha-lens/src/App.tsx:

  import LeaderboardPage from "@/pages/leaderboard"

Add as a PUBLIC route (outside the auth guard):
  <Route path="/leaderboard" component={LeaderboardPage} />

The leaderboard must be accessible without login.
This is intentional — it is a marketing page.

---

## STEP 7 — Empty state

When no calls have been resolved yet
(early in the 90-day period), show:

  A progress bar showing days elapsed.
  A table of OPEN calls with their AI probability
  and edge — showing what the AI is currently watching.
  Text: "First outcomes will appear as the AI's
  predictions resolve. The track record started
  April 22, 2026."

This gives visitors something to see even before
the first calls resolve.

---

## DESIGN NOTES

Dark financial terminal aesthetic — match the
existing pages.

The stats bar should feel like a Bloomberg terminal
scorecard — authoritative, data-dense, credible.

Use monospaced font (font-mono) for numbers
throughout — it reads as precise and financial.

The most important number on the page is the
win rate. Make it the largest element on the page.

---

## VERIFICATION

After all steps, verify:

1. pnpm run typecheck — zero errors
2. GET /api/leaderboard — returns stats and
   recommendations without auth header
3. Navigate to /leaderboard in browser without
   logging in — page loads
4. Stats bar shows track record period and day count
5. Table shows open recommendations from the DB
6. Track Record appears in nav sidebar
7. PATCH /api/recommendations/:id/outcome with
   admin token — updates outcome field
8. After updating one outcome, leaderboard stats
   update correctly (win rate, paper return)
9. Calibration chart shows when 10+ resolved calls exist
10. Page works on mobile (375px) without horizontal scroll
