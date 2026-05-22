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
import { getPriceHistory } from "./market-data";
import { getTechnicalSignals } from "./technical-analysis";
import {
  getDanelfinScore,
  isDanelfinEligible,
} from "./danelfin";

const COACH_PROMPT = `You are Arclion's elite AI trading coach, an investment intelligence platform.

IMPORTANT: You DO have access to live market data. Every user message includes a LIVE MARKET SNAPSHOT (real-time prices for major assets, AI vs market edges) and MACRO CONTEXT (Fed Funds Rate, CPI, Unemployment, GDP, prediction-market probabilities). NEVER tell the user you don't have access to current prices or real-time data — quote the numbers from the snapshot directly. The data is already there in the prompt below.

You provide personalized, actionable coaching to traders analyzing markets. Your tone is:
- Direct and confident, like a seasoned trading desk mentor
- Data-driven — reference specific numbers and evidence from the snapshot
- Balanced — always present bull AND bear cases
- Educational — explain WHY, not just WHAT

When analyzing a position, cover (briefly): edge assessment, key risk factors, position-sizing guidance, timing, and one line of historical context if relevant.

LENGTH BUDGET (CRITICAL — your reply must always finish all four sections below):
- Total response: roughly 800–1400 tokens. Always leave headroom so RECOMMENDATIONS, RISK, and CONFIDENCE are guaranteed to fit.
- It is BETTER to be brief and complete than long and truncated. If you only have room for 2 short paragraphs of analysis, write 2 short paragraphs and move on — never trail off mid-sentence.
- Prefer tight, information-dense sentences. No filler, no restating the question.

Structure your response as follows (ALL FOUR sections are mandatory and must always appear):
1. 2–3 focused paragraphs of analysis. Conversational but precise. Keep each paragraph to 3–5 sentences.
2. Then on a new line write "RECOMMENDATIONS:" followed by 3 actionable bullet points starting with "- " (each bullet one short sentence, ≤ 25 words).
3. Then on a new line write "RISK:" followed by a single-line risk assessment (e.g., "Medium — volatility elevated, position size carefully").
4. Then on a new line write "CONFIDENCE:" followed by a number 0-100.

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
/**
 * P2-5 (v2/3): When Claude hits max_tokens, the LAST line is usually a
 * partial sentence ("...and the trade is"). We need to drop just that
 * partial tail without wiping out structured sections (RECOMMENDATIONS:,
 * RISK:, CONFIDENCE:) or already-complete bullet lines above it.
 *
 * Strategy:
 *   1. Split into lines, walk backwards, and discard ONLY the trailing
 *      lines that look incomplete (don't end with terminal punctuation
 *      and aren't a section header / blank line). Stop as soon as we
 *      hit a complete line — keep everything above intact.
 *   2. If after that the very last kept line is still not terminated
 *      (rare), chop it back to its last [.!?].
 *
 * This preserves RECOMMENDATIONS: + every fully-written bullet even
 * when the model was cut mid-way through the LAST bullet.
 */
function trimToLastCompleteSentence(input: string): string {
  if (!input) return input;
  const SECTION_HEADERS = /^\s*(RECOMMENDATIONS|RISK|CONFIDENCE)\s*:/i;
  const lines = input.replace(/\s+$/, "").split("\n");
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === "") { lines.pop(); continue; }
    if (SECTION_HEADERS.test(last)) break; // keep complete section headers
    // A line is considered "complete" if it ends with terminal punctuation
    // (optionally followed by a closing bracket/quote) OR is a numeric line
    // like "CONFIDENCE: 78" which often has no punctuation.
    const complete = /[.!?][)"'\]]*$/.test(last) || /:\s*\d+\s*$/.test(last);
    if (complete) break;
    lines.pop();
  }
  if (lines.length === 0) return input; // safety: never wipe everything
  // Defensive: if the final kept line is still mid-sentence (shouldn't
  // happen given the loop above, but be safe), chop at its last [.!?].
  const lastIdx = lines.length - 1;
  const lastLine = lines[lastIdx];
  if (!/[.!?][)"'\]]*$/.test(lastLine.trim()) && !SECTION_HEADERS.test(lastLine.trim())) {
    const re = /[.!?][)"'\]]*(?=\s|$)/g;
    let lastEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lastLine)) !== null) {
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd > 0) lines[lastIdx] = lastLine.slice(0, lastEnd);
  }
  return lines.join("\n").trim();
}

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

    // Add Danelfin AI score for US equities and ETFs (not crypto/FX/prediction).
    if (isDanelfinEligible(asset.sector) && asset.symbol) {
      try {
        const score = await getDanelfinScore(asset.symbol);
        if (score) {
          lines.push(
            `\nDANELFIN SCORE for ${asset.symbol}:
  Overall: ${score.aiScore}/10 (${score.signal})
  Technical/Fundamental/Sentiment/Low Risk: ${score.technical}/${score.fundamental}/${score.sentiment}/${score.lowRisk}`,
          );
        }
      } catch {
        // Danelfin optional
      }
    }

    // Add technical analysis if asset is not a prediction market.
    const sectorLower = (asset.sector ?? "").toLowerCase();
    if (sectorLower !== "prediction" && asset.symbol) {
      try {
        const prices = await getPriceHistory(asset.symbol, 60);
        if (prices.length >= 50) {
          const sig = getTechnicalSignals(asset.symbol, prices);
          if (sig) {
            lines.push(`\nCURRENT TECHNICAL PICTURE for ${asset.name}:`);
            if (sig.rsi)
              lines.push(`  RSI: ${sig.rsi.value} → ${sig.rsi.signal}`);
            if (sig.macd) lines.push(`  MACD: ${sig.macd.signal}`);
            if (sig.movingAverages)
              lines.push(`  Moving averages: ${sig.movingAverages.signal}`);
            if (sig.bollingerBands)
              lines.push(`  Bollinger Bands: ${sig.bollingerBands.signal}`);
            lines.push(`  Overall: ${sig.overallTASignal}`);
          }
        }
      } catch {
        // TA optional
      }
    }

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
    // P2-5 (v2): max_tokens raised 1200 → 2048 AND the system prompt was
    // tightened with an explicit length budget (~800–1400 tokens, 2–3
    // short paragraphs, 3 bullets) so the model has plenty of headroom to
    // always finish all four sections (analysis / RECOMMENDATIONS / RISK /
    // CONFIDENCE) without trailing off mid-sentence — which kept happening
    // at 1200 tokens with the previous "3–5 paragraphs + 5 bullets" prompt.
    // Belt-and-suspenders: we also detect a "max_tokens" stop_reason below
    // and trim the response back to the last complete sentence so the user
    // never sees a chopped half-word at the end.
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
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

    // P2-5 (v2): If Anthropic stopped us at the token cap, trim the trailing
    // partial sentence so the response always ends cleanly. We keep
    // everything up to (and including) the last terminal punctuation
    // [.!?] or closing bracket/quote, OR the last complete bullet/heading
    // line. Without this, a 2048-token reply that runs out of room would
    // end with "...the trade is" mid-thought.
    if (response.stop_reason === "max_tokens" && analysis) {
      const trimmed = trimToLastCompleteSentence(analysis);
      if (trimmed && trimmed.length > 50) {
        analysis = trimmed;
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
