import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import {
  assetsTable,
  signalsTable,
  dailyBriefingsTable,
  recommendationsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, isNull, and } from "drizzle-orm";
import { fetchMacroContext } from "./macro-data";

const COACH_PROMPT = `You are Arclion's elite AI trading coach, an investment intelligence platform.

IMPORTANT: You DO have access to live market data. Every user message includes a LIVE MARKET SNAPSHOT (real-time prices for major assets, AI vs market edges) and MACRO CONTEXT (Fed Funds Rate, CPI, Unemployment, GDP, prediction-market probabilities). NEVER tell the user you don't have access to current prices or real-time data — quote the numbers from the snapshot directly. The data is already there in the prompt below.

You provide personalized, actionable coaching to traders analyzing markets. Your tone is:
- Direct and confident, like a seasoned trading desk mentor
- Data-driven — reference specific numbers and evidence from the snapshot
- Balanced — always present bull AND bear cases
- Educational — explain WHY, not just WHAT

When analyzing a position, cover:
1. Edge assessment — is the AI vs market gap tradeable?
2. Risk factors — what could make the trade go wrong?
3. Position sizing guidance — how much to allocate?
4. Timing — is now the right entry or should they wait?
5. Historical context — what happened in similar setups?

Structure your response as follows:
1. First, write 3-5 focused paragraphs of analysis. Be conversational but precise.
2. Then on a new line write "RECOMMENDATIONS:" followed by 3-5 actionable bullet points starting with "- "
3. Then on a new line write "RISK:" followed by a single-line risk assessment (e.g., "Medium — volatility elevated, position size carefully")
4. Then on a new line write "CONFIDENCE:" followed by a number 0-100

MARKDOWN FORMATTING RULES (strict):
- Use only well-formed markdown. Every "**" opening MUST have a matching closing "**" with no spaces between the asterisks and the bolded word(s) (correct: **High**, incorrect: ** High** or High **).
- Never emit a stray "**" by itself or with trailing whitespace.
- Bullet lines must start with "- " (a hyphen and a space). Never use "**" as a bullet marker.
- Use plain words for emphasis when in doubt rather than risk unbalanced asterisks.`;

/**
 * Strip stray asterisks that aren't part of a balanced **bold** pair.
 * Also turns `* ` line bullets into `- ` line bullets so remark-gfm renders
 * them as a list instead of italic emphasis. Whitelisted patterns:
 *  - `**word**` (well-formed bold) is preserved
 *  - `- item` bullets are preserved
 * Anything else loose (single `*`, leading `* `, trailing `**`) is cleaned up.
 */
function sanitizeMarkdown(input: string): string {
  if (!input) return input;
  let out = input;

  // Convert `* ` bullets at start of line to `- ` bullets.
  out = out.replace(/^[ \t]*\*[ \t]+/gm, "- ");

  // Drop leftover orphan `**` that isn't paired (odd count on a line).
  out = out
    .split("\n")
    .map((line) => {
      const dblCount = (line.match(/\*\*/g) ?? []).length;
      if (dblCount % 2 !== 0) {
        // Remove the LAST stray ** to balance.
        const idx = line.lastIndexOf("**");
        if (idx !== -1) {
          line = line.slice(0, idx) + line.slice(idx + 2);
        }
      }
      return line;
    })
    .join("\n");

  // NOTE: We intentionally do NOT globally rewrite single `*` here. Valid
  // italic emphasis (`*word*`) is rendered correctly by remark-gfm and must be
  // preserved. The leading bullet conversion on line above already handles the
  // most common stray-asterisk case; orphan `**` is balanced above. Anything
  // else is treated as authored content.

  // Final defensive trim of doubled spaces.
  out = out.replace(/[ \t]{2,}/g, " ");

  return out;
}

interface CoachInput {
  assetId?: number | null;
  question: string;
  context?: string | null;
}

async function buildAssetContext(assetId: number): Promise<string> {
  try {
    const [asset] = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.id, assetId))
      .limit(1);
    if (!asset) return "";
    const lines: string[] = [];
    lines.push(`The user is asking about ${asset.name} (${asset.symbol}).`);
    if (asset.currentPrice != null) lines.push(`Current price: $${asset.currentPrice}`);
    if (asset.aiProbability != null) lines.push(`AI probability: ${(asset.aiProbability * 100).toFixed(1)}%`);
    if (asset.marketProbability != null) lines.push(`Market probability: ${(asset.marketProbability * 100).toFixed(1)}%`);
    if (asset.edge != null) lines.push(`Edge: ${asset.edge.toFixed(1)} pts`);
    if (asset.direction) lines.push(`Direction: ${asset.direction}`);
    if (asset.sector) lines.push(`Sector: ${asset.sector}`);
    if (asset.region) lines.push(`Region: ${asset.region}`);
    if (asset.aiSummary) lines.push(`AI summary: ${asset.aiSummary}`);

    try {
      const recentSignals = await db
        .select()
        .from(signalsTable)
        .where(eq(signalsTable.assetId, assetId))
        .orderBy(desc(signalsTable.createdAt))
        .limit(5);
      if (recentSignals.length > 0) {
        lines.push("\nRecent signals:");
        for (const s of recentSignals) {
          lines.push(`- ${(s as any).headline ?? (s as any).title ?? "signal"}`);
        }
      }
    } catch {
      // signals optional
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}

async function buildMarketSnapshot(question: string): Promise<string> {
  try {
    const top = await db
      .select()
      .from(assetsTable)
      .orderBy(sql`${assetsTable.alphaScore} DESC NULLS LAST`)
      .limit(5);

    const allAssets = await db.select().from(assetsTable);
    const q = question.toLowerCase();
    const seen = new Set(top.map((a) => a.id));
    const mentioned = allAssets.filter(
      (a) =>
        !seen.has(a.id) &&
        ((a.symbol && q.includes(a.symbol.toLowerCase())) ||
          (a.name && q.includes(a.name.toLowerCase()))),
    );
    const combined = [...top, ...mentioned];
    if (combined.length === 0) return "";
    const lines: string[] = [
      `LIVE MARKET DATA (as of ${new Date().toISOString()}):`,
      "Top opportunities by alpha score:",
    ];
    for (const a of combined) {
      const parts: string[] = [`- ${a.name} (${a.symbol})`];
      if (a.currentPrice != null) parts.push(`price $${a.currentPrice}`);
      if (a.aiProbability != null) parts.push(`AI ${a.aiProbability}%`);
      if (a.marketProbability != null) parts.push(`vs market ${a.marketProbability}%`);
      if (a.edge != null) parts.push(`edge ${a.edge >= 0 ? "+" : ""}${a.edge}pts`);
      parts.push(`direction: ${a.direction ?? "neutral"}`);
      lines.push(parts.join(", "));
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

async function buildTopOpportunities(): Promise<string> {
  try {
    const openRecs = await db
      .select()
      .from(recommendationsTable)
      .where(
        and(
          isNull(recommendationsTable.outcome),
          eq(recommendationsTable.type, "trade"),
        ),
      )
      .orderBy(sql`${recommendationsTable.convictionScore} DESC NULLS LAST`)
      .limit(3);

    if (openRecs.length === 0) return "";

    const lines: string[] = ["TOP OPPORTUNITIES (by conviction score):"];
    openRecs.forEach((r, i) => {
      const conv =
        typeof r.convictionScore === "number"
          ? r.convictionScore.toFixed(1)
          : "N/A";
      const edge =
        typeof r.edge === "number"
          ? `${r.edge >= 0 ? "+" : ""}${r.edge.toFixed(1)}`
          : "N/A";
      lines.push(
        `${i + 1}. ${r.assetTitle || r.title}: conviction ${conv}, edge ${edge}`,
      );
      if (r.edgeExplanation && r.edgeExplanation.trim().length > 0) {
        lines.push(`   ${r.edgeExplanation.trim()}`);
      }
    });
    return lines.join("\n");
  } catch {
    return "";
  }
}

async function buildLatestBriefing(): Promise<string> {
  try {
    const [b] = await db
      .select({ summary: dailyBriefingsTable.summary })
      .from(dailyBriefingsTable)
      .orderBy(desc(dailyBriefingsTable.id))
      .limit(1);
    const summary = (b?.summary ?? "").trim();
    const isPlaceholder = /^(undefined|null)$/i.test(summary);
    const safeSummary =
      summary.length > 10 && !/error/i.test(summary) && !isPlaceholder
        ? summary.slice(0, 200)
        : "";
    if (!safeSummary) return "";
    const excerpt =
      safeSummary.length > 100 ? safeSummary.slice(0, 100) + "…" : safeSummary;
    return `Latest briefing: ${excerpt}`;
  } catch {
    return "";
  }
}

export async function getCoachAnalysis(input: CoachInput) {
  let assetContext = "";
  if (input.assetId != null) {
    assetContext = await buildAssetContext(input.assetId);
  }
  const [marketSnapshot, topOpportunities, briefingLine, macroContext] =
    await Promise.all([
      buildMarketSnapshot(input.question),
      buildTopOpportunities(),
      buildLatestBriefing(),
      fetchMacroContext(),
    ]);
  const macroBlock = macroContext.replace(/^\n+/, "").trim();
  const contextParts = [
    marketSnapshot,
    topOpportunities,
    briefingLine,
    assetContext,
    macroBlock,
    input.context,
  ]
    .filter(Boolean)
    .join("\n\n");
  const prompt = contextParts
    ? `--- LIVE DATA AVAILABLE ---\n${contextParts}\n--- END LIVE DATA ---\n\nUser question: ${input.question}`
    : `User question: ${input.question}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: COACH_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
 

   
    let analysis = "";
    for (const block of response.content) {
      if (block.type === "text") {
        analysis = block.text.trim();
        break;
      }
    }

    const recommendations: string[] = [];
    let riskAssessment: string | null = null;
    const confidence = 0.75;
    let mainAnalysis = analysis;

    const recIdx = analysis.indexOf("RECOMMENDATIONS:");
    if (recIdx !== -1) {
      mainAnalysis = analysis.slice(0, recIdx).trim();
      const afterRec = analysis.slice(recIdx + "RECOMMENDATIONS:".length);
      const riskIdx = afterRec.indexOf("RISK:");
      const recBlock = riskIdx !== -1 ? afterRec.slice(0, riskIdx) : afterRec;
      for (const line of recBlock.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.match(/^\d+\.\s/)) {
          recommendations.push(trimmed.replace(/^[-•\d.]\s*/, "").trim());
        }
      }

      if (riskIdx !== -1) {
        const afterRisk = afterRec.slice(riskIdx + "RISK:".length);
        const confIdx = afterRisk.indexOf("CONFIDENCE:");
        const riskLine = confIdx !== -1 ? afterRisk.slice(0, confIdx) : afterRisk;
        riskAssessment = riskLine.trim().split("\n")[0].trim() || null;
      }
    } else {
      const lines = analysis.split("\n");
      for (const line of lines) {
        if (line.startsWith("- ") || line.startsWith("• ") || line.match(/^\d+\.\s/)) {
          recommendations.push(line.replace(/^[-•\d.]\s*/, "").trim());
        }
      }
    }

    return {
      analysis: sanitizeMarkdown(mainAnalysis),
      recommendations: recommendations.slice(0, 5).map(sanitizeMarkdown),
      riskAssessment: riskAssessment ? sanitizeMarkdown(riskAssessment) : null,
      confidence,
    };
  } catch (e: any) {
    return {
      analysis: `I'm having trouble connecting to the AI service right now. Here's what I can say based on the available data: ${input.question}. Consider checking back in a moment for a full analysis.`,
      recommendations: [
        "Review the market signals tab for latest evidence",
        "Consider the edge size relative to your risk tolerance",
        "Paper trade small positions first to test your thesis",
      ],
      riskAssessment: "Unable to assess — AI service temporarily unavailable",
      confidence: 0.3,
    };
  }
}
