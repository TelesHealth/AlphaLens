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

Keep responses to 3-5 focused paragraphs. No markdown headers. Be conversational but precise.`;

interface CoachInput {
  assetId?: number | null;
  question: string;
  context?: string | null;
}

export async function getCoachAnalysis(input: CoachInput) {
  const prompt = `${input.question}${input.context ? `\n\nAdditional context:\n${input.context}` : ""}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
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
    const lines = analysis.split("\n");
    for (const line of lines) {
      if (
        line.startsWith("- ") ||
        line.startsWith("• ") ||
        line.match(/^\d+\.\s/)
      ) {
        recommendations.push(line.replace(/^[-•\d.]\s*/, "").trim());
      }
    }

    return {
      analysis,
      recommendations: recommendations.slice(0, 5),
      riskAssessment: null as string | null,
      confidence: 0.75,
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
