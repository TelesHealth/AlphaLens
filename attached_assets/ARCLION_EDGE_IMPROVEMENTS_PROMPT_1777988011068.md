# Arclion — Edge Calculation Improvements
## May 2026

Paste this entire document into Replit AI.

---

## Context

The Edge field (AI Probability − Market Price) is the
core signal in Arclion. Four problems have been
identified that need to be fixed together:

1. Edge is not normalized by asset class — comparing
   prediction market edge to equity/crypto edge on the
   same scale is misleading

2. Edge doesn't account for confidence — a +26 edge
   at 45% confidence is very different from +26 at 85%

3. Edge doesn't decay over time — edge calculated 6
   hours ago is still shown as current

4. Market price field stores AI probability (not asset
   dollar price) for equities and commodities, making
   the edge calculation wrong for those asset classes

Fix all four problems in this order.

---

## PROBLEM 1 — Fix the marketPrice field for
## equities, commodities, and crypto

This is the most critical fix. The marketPrice field
on recommendations currently stores the AI probability
percentage (e.g. 48) instead of the actual asset price
(e.g. $72.50 for USO) for non-prediction-market assets.
This makes edge calculations wrong for these assets.

### Fix in recommendations.ts

In artifacts/api-server/src/services/recommendations.ts,
find where marketPrice is set on each recommendation.

Add a new field to the recommendations schema and table:

  assetPriceAtCall: numeric nullable
    — the actual dollar price of the asset at the
      time the recommendation was made
    — populated from the assets table currentPrice
    — NEVER uses AI probability

Run: pnpm --filter @workspace/db run push

When building each recommendation:

For PREDICTION MARKET assets (assetClass = "prediction"):
  marketPrice = the Kalshi/Polymarket contract price
    (0-100, represents probability %)
  assetPriceAtCall = null (not applicable)
  edge = aiProbability - marketPrice (correct as-is)

For EQUITY, CRYPTO, COMMODITY, FX assets:
  marketPrice = the current asset dollar price
    from assets.currentPrice
    (e.g. $72.50 for USO, $78,000 for BTC)
  assetPriceAtCall = same as marketPrice (snapshot)
  edge = calculated differently — see Problem 2

Update the leaderboard outcome resolver to use
assetPriceAtCall as the entry price for paper return
calculations, not marketPrice. This fixes the crude
oil paper return bug where the system was comparing
48 (probability) to 147 (barrel price).

---

## PROBLEM 2 — Normalized edge by asset class

Edge means different things for different asset classes.
Fix the edge calculation and display for each class.

### For PREDICTION MARKET assets (Kalshi, Polymarket):

Edge calculation stays the same:
  edge = aiProbability - marketPrice
  (both in probability %, both on the same scale)
  Example: AI 74% - Market 48% = +26 edge

This is correct. No change needed for prediction markets.

### For EQUITY, CRYPTO, COMMODITY, FX assets:

Edge for these assets should represent how far the AI's
probability assessment is from the implied probability
in the current price movement, NOT a raw price difference.

Fix: use a normalized edge calculation based on the
AI's directional conviction:

  For LONG recommendations:
    edge = aiProbability - 50
    (50 = neutral/coin flip baseline)
    Example: AI 70% bullish → edge = +20

  For SHORT recommendations:
    edge = 50 - aiProbability
    (inverted — higher AI bearish prob = positive edge)
    Example: AI 65% bearish → edge = +15

This puts all asset classes on a comparable 0-50 scale
where:
  edge > 20 = strong signal
  edge 10-20 = moderate signal
  edge < 10 = weak signal (below MIN_EDGE threshold)

Add a new field to recommendations:
  edgeType: "probability_gap" | "directional_conviction"
  prediction markets → "probability_gap"
  all others → "directional_conviction"

Store edgeType alongside edge so the frontend can
display the correct label and tooltip.

### Add convictionScore field

After calculating edge and confidence, compute a
combined conviction score:

  convictionScore = Math.round(edge * confidence * 10) / 10

Examples:
  edge 26, confidence 0.78 → convictionScore = 20.3
  edge 10, confidence 0.65 → convictionScore = 6.5
  edge 30, confidence 0.90 → convictionScore = 27.0

Add convictionScore to the recommendations table schema.
Populate it on every recommendation insert.

Run: pnpm --filter @workspace/db run push

Update the leaderboard and briefing endpoints to sort
by convictionScore instead of edge when returning
recommendations. Higher conviction = shown first.

---

## PROBLEM 3 — Edge freshness timestamp

Edge calculated 6 hours ago may be stale if the market
has moved toward the AI's view. Add visibility into
how old each edge calculation is.

### Add edgeCalculatedAt field

Add to recommendations table:
  edgeCalculatedAt: timestamp default now()
  — set to the current timestamp when the recommendation
    is created or when edge is recalculated

Run: pnpm --filter @workspace/db run push

### Add edgeAgeMinutes to API responses

In GET /api/recommendations/briefing and
GET /api/recommendations/recommendations, add:

  edgeAgeMinutes: Math.floor(
    (Date.now() - rec.edgeCalculatedAt.getTime()) / 60000
  )

This tells the frontend how many minutes ago the edge
was calculated.

### Add edge refresh on market data refresh

In artifacts/api-server/src/services/market-data.ts,
after refreshAllMarkets() completes, trigger a lightweight
edge recalculation for all open recommendations:

  async function refreshRecommendationEdges() {
    // Get all recommendations with outcome = null
    // (still open, not yet resolved)
    const openRecs = await db
      .select()
      .from(recommendationsTable)
      .where(isNull(recommendationsTable.outcome));

    for (const rec of openRecs) {
      // Find the matched asset
      const asset = await getAssetByTitle(rec.assetTitle);
      if (!asset) continue;

      // Recalculate edge based on current market price
      let newEdge = rec.edge;
      if (rec.assetClass === "prediction") {
        newEdge = rec.aiProbability - (asset.marketProbability ?? asset.currentPrice);
      } else {
        // directional conviction stays the same
        // (aiProbability doesn't change between scans)
        newEdge = rec.edge;
      }

      const newConvictionScore =
        Math.round(newEdge * (rec.confidence ?? 0.75) * 10) / 10;

      await db
        .update(recommendationsTable)
        .set({
          edge: newEdge,
          convictionScore: newConvictionScore,
          edgeCalculatedAt: new Date(),
          marketPrice: rec.assetClass === "prediction"
            ? (asset.marketProbability ?? asset.currentPrice)
            : asset.currentPrice
        })
        .where(eq(recommendationsTable.id, rec.id));
    }
    console.log(`Edge refresh: updated ${openRecs.length} open recommendations`);
  }

Call refreshRecommendationEdges() at the end of every
market data refresh cycle (every 5 minutes).

This keeps edge values current between full AI scans.

---

## PROBLEM 4 — Frontend display improvements

### Update briefing cards (briefing.tsx)

In artifacts/alpha-lens/src/pages/briefing.tsx,
update RecommendationCard to show:

1. Conviction Score prominently (larger than edge)
   Label: "Conviction"
   Value: rec.convictionScore (e.g. 20.3)

2. Edge with asset-class-appropriate label:
   If edgeType === "probability_gap":
     Label: "Probability gap"
     Tooltip: "AI probability vs market contract price"
   If edgeType === "directional_conviction":
     Label: "Directional edge"
     Tooltip: "AI directional confidence above neutral baseline"

3. Edge freshness indicator:
   If edgeAgeMinutes < 30: green dot + "Live"
   If edgeAgeMinutes 30-120: amber dot + "X min ago"
   If edgeAgeMinutes > 120: gray dot + "X hr ago"

4. Market price label by asset class:
   prediction: "Market probability: X%"
   equity/crypto/commodity: "Current price: $X"
   fx: "Current rate: X"

### Update scanner (scanner.tsx)

In artifacts/alpha-lens/src/pages/scanner.tsx:

1. Add convictionScore column to the scanner table
   Sort by convictionScore by default (not raw edge)

2. Add edgeType indicator — small badge showing
   "PROB GAP" for prediction markets and
   "DIRECTIONAL" for equities/crypto

3. Add edge freshness dot to each row

### Update leaderboard (leaderboard.tsx)

In artifacts/alpha-lens/src/pages/leaderboard.tsx:

1. Add a new stats card: "Avg Conviction Score"
   Shows the average convictionScore across all
   resolved TRADE CALLS

2. Add correlation metric to the calibration section:
   "High conviction calls (>15): X% win rate"
   "Low conviction calls (<10): X% win rate"
   This shows whether conviction score predicts outcomes

3. In the recommendations table, add the convictionScore
   column and sort by it

---

## VERIFICATION

After all changes:

1. pnpm run typecheck — zero errors

2. Verify prediction market recommendations:
   GET /api/recommendations/briefing
   FED-CUT recommendation should show:
   - marketPrice ≈ 48 (Kalshi contract price)
   - edge = aiProbability - 48
   - edgeType = "probability_gap"
   - assetPriceAtCall = null

3. Verify equity/commodity recommendations:
   USO (crude oil) recommendation should show:
   - marketPrice = actual USO dollar price (~$72-80)
   - assetPriceAtCall = same dollar price
   - edge = aiProbability - 50 (directional)
   - edgeType = "directional_conviction"
   - convictionScore = edge × confidence

4. Verify crypto recommendations:
   BTC recommendation should show:
   - marketPrice = actual BTC price (~$78,000)
   - edge = directional conviction score
   - NOT 48 or any probability placeholder

5. Verify edge freshness:
   GET /api/recommendations/briefing
   Each recommendation should have edgeAgeMinutes field
   Recommendations from last 30 min should show < 30

6. Verify conviction score sorting:
   Briefing should show highest convictionScore first
   not highest raw edge first

7. Verify paper return fix:
   Check a resolved USO recommendation
   assetPriceAtCall should be a dollar price not 48
   paperReturn should now be calculated correctly

8. Run POST /api/markets/refresh
   Console should show:
   "Edge refresh: updated N open recommendations"

Run pnpm run typecheck. Zero errors required.
Report all files changed.
