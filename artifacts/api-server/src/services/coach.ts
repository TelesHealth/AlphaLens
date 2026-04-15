import { anthropic } from "@workspace/integrations-anthropic-ai";

const COACH_PROMPT = `You are an elite AI trading coach for Alpha Lens, an investment intelligence platform.

You provide personalized, actionable coaching to traders analyzing markets. Your tone is:
- Direct and confident, like a seasoned trading desk mentor
- Data-driven — reference specific numbers and evidence
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
4. Then on a new line write "CONFIDENCE:" followed by a number 0-100`;

interface CoachInput {
  assetId?: number | null;
  question: string;
  context?: string | null;
}

export async function getCoachAnalysis(input: CoachInput) {
  const prompt = `${input.question}${input.context ? `\n\nAdditional context:\n${input.context}` : ""}`;

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
    let confidence = 0.75;
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

        if (confIdx !== -1) {
          const confStr = afterRisk.slice(confIdx + "CONFIDENCE:".length).trim().split("\n")[0].trim();
          const parsed = parseInt(confStr, 10);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
            confidence = parsed / 100;
          }
        }
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
      analysis: mainAnalysis,
      recommendations: recommendations.slice(0, 5),
      riskAssessment,
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
