import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { assetsTable, signalsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SCORING_PROMPT = `You are a calibrated AI market analyst for Alpha Lens, an investment intelligence platform.

Given a market asset and any existing signals, analyze it and provide:
1. An AI probability score (0-100) representing the likelihood of a positive outcome
2. Market probability comparison
3. Edge assessment (AI vs market)
4. Direction (bullish/bearish/neutral)
5. Research-based signals with sources

Return ONLY valid JSON with this exact structure:
{
  "aiProbability": <number 0-100>,
  "direction": "bullish" | "bearish" | "neutral",
  "confidence": <number 0-1>,
  "reasoning": "<2-3 sentence analysis>",
  "signals": [
    {
      "type": "geopolitical" | "economic" | "technical" | "sentiment" | "fundamental" | "alternative",
      "source": "<source name>",
      "headline": "<signal headline>",
      "detail": "<1-2 sentence detail>",
      "impact": "high" | "medium" | "low",
      "direction": "bullish" | "bearish" | "neutral",
      "confidence": <number 0-1>
    }
  ]
}

Rules:
- For prediction markets: probability is P(YES resolution)
- For crypto/stocks/commodities: probability is P(price increase in next 30 days)
- Generate 3-6 realistic evidence-based signals
- Be calibrated — don't always predict 50%
- Always output valid JSON only, no markdown`;

type AssetRow = typeof assetsTable.$inferSelect;

export async function scoreMarketWithAI(market: AssetRow) {
  const prompt = `Analyze this market:
Name: ${market.name}
Symbol: ${market.symbol}
Sector: ${market.sector}
Current Price: ${market.currentPrice ?? "Unknown"}
Price Change 24h: ${market.priceChange24h ?? "Unknown"}%
${market.description ? `Description: ${market.description}` : ""}

Provide your AI probability assessment, direction, and generate evidence signals.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SCORING_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    let raw = "";
    for (const block of response.content) {
      if (block.type === "text") {
        raw = block.text.trim();
        break;
      }
    }

    if (raw.startsWith("```")) {
      raw = raw.split("```")[1];
      if (raw.startsWith("json")) raw = raw.slice(4);
    }

    const scored = JSON.parse(raw);
    const aiProb = Number(scored.aiProbability) || 50;
    const marketProb = market.marketProbability ?? market.currentPrice ?? 50;
    const edge = Math.round((aiProb - marketProb) * 10) / 10;
    const direction = scored.direction || "neutral";
    const alphaScore = Math.abs(edge) * (scored.confidence || 0.5) * 10;

    console.log("Confidence: ", scored.confidence);
    const [updatedMarket] = await db
      .update(assetsTable)
      .set({
        aiProbability: aiProb,
        edge,
        direction,
        alphaScore: Math.round(alphaScore * 10) / 10,
        aiSummary: scored.reasoning || null,
        lastScoredAt: new Date(),
        riskLevel:
          Math.abs(edge) > 15
            ? "extreme"
            : Math.abs(edge) > 10
              ? "high"
              : Math.abs(edge) > 5
                ? "medium"
                : "low",
        updatedAt: new Date(),
      })
      .where(eq(assetsTable.id, market.id))
      .returning();

    if (scored.signals && Array.isArray(scored.signals)) {
      for (const sig of scored.signals) {
        await db.insert(signalsTable).values({
          assetId: market.id,
          type: sig.type || "fundamental",
          source: sig.source || "AI Analysis",
          headline: sig.headline || "Signal detected",
          detail: sig.detail || null,
          impact: sig.impact || "medium",
          direction: sig.direction || "neutral",
          confidence: sig.confidence || 0.5,
        });
      }
    }

    return {
      market: updatedMarket,
      scoring: {
        aiProbability: aiProb,
        marketProbability: marketProb,
        edge,
        direction,
        confidence: scored.confidence || 0.5,
        reasoning: scored.reasoning || "AI analysis complete.",
      },
    };
  } catch (e: any) {
    // Bug fix: previously, ANY error in this function (transient Anthropic
    // 5xx, rate limit, JSON parse hiccup, etc.) overwrote the asset row
    // with synthetic fallback values — a random ~50% probability and the
    // text "AI scoring encountered an issue." This wiped the last good
    // scan, so a user landing on /market/:id during a transient failure
    // would see the error banner where their previous analysis used to be.
    //
    // New behavior: on failure, we DO NOT touch the DB at all. The asset
    // row keeps its last successful scan (aiProbability, aiSummary,
    // edge, alphaScore, lastScoredAt) and the next successful scan will
    // refresh it normally. The error is logged and returned in `scoring`
    // so callers (manual "Trigger Deep Analysis" button) can surface a
    // toast, but the persisted UI data stays intact.
    //
    // For brand-new assets that have never been scored successfully, the
    // existing row is still returned unchanged (everything null / default)
    // and the UI will continue to show its "no analysis yet" empty state
    // — which is honest, and much better than a fake fallback that looks
    // like a real scan.
    console.error(
      `[scoreMarketWithAI] scoring failed for asset id=${market.id} symbol=${market.symbol}: ${e?.message ?? e}. Preserving last successful scan in DB.`,
    );

    const marketProb = market.marketProbability ?? market.currentPrice ?? 50;
    // The DB column `assets.direction` is plain text and could in principle
    // contain a legacy/unexpected value. Validate against the allowlist
    // here so we never return an out-of-band literal to the client.
    const allowedDirections = ["bullish", "bearish", "neutral"] as const;
    type Direction = (typeof allowedDirections)[number];
    const safeDirection: Direction = (
      allowedDirections as readonly string[]
    ).includes(market.direction ?? "")
      ? (market.direction as Direction)
      : "neutral";
    return {
      market, // unchanged — last good scan preserved
      scoring: {
        aiProbability: market.aiProbability ?? 0,
        marketProbability: marketProb,
        edge: market.edge ?? 0,
        direction: safeDirection,
        confidence: 0,
        reasoning: `Scoring temporarily unavailable (${e?.message ?? "unknown error"}). Showing last successful analysis.`,
      },
    };
  }
}
