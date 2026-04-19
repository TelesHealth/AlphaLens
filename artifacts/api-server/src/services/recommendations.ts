import { db } from "@workspace/db";
import {
  assetsTable,
  signalsTable,
  dailyBriefingsTable,
  recommendationsTable,
  globalEventsTable,
} from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  fetchOptionsFlowAlerts,
  fetchDarkPoolAlerts,
  fetchCongressionalTrades,
} from "./unusual-whales";
import { fetchMacroContext } from "./fred-macro";

const AGENT_SYSTEM_PROMPT = `You are the Alpha Lens proactive trading intelligence agent.

Scan a list of scored assets and identify the BEST opportunities:
1. TRADE CALL - clear edge, strong evidence, act now
2. WATCH - developing setup, wait for confirmation trigger
3. AVOID - risk elevated, evidence against a position

For EACH recommendation provide:
- A punchy headline (max 12 words) like a tip from a sharp trader
- Why flagged (3-5 specific signal bullets, not generic)
- Historical context: what happened in similar past setups (cite year + outcome)
- Entry trigger (for WATCH) or action (for TRADE)
- Confidence score 0-100
- Execution window
- Urgency: high (act today) | medium (this week) | low (developing)
- Bear case: what could make this wrong

RULES:
- Max 3 TRADE CALLS per briefing
- Max 8 WATCHES per briefing
- Always cite specific historical analog with year
- Never force a recommendation if no strong opportunity exists
- When smart money signals are provided, cross-reference them with asset data. A large options bet on an asset where AI also shows edge is a high-conviction signal.

Return JSON array only. Each object:
{
  "type": "trade" or "watch" or "avoid",
  "urgency": "high" or "medium" or "low",
  "title": "Short punchy headline",
  "assetTitle": "Name of the asset",
  "sector": "sector name",
  "direction": "LONG or SHORT or YES or NO or WATCH",
  "headline": "2-3 sentence explanation",
  "why": ["signal 1", "signal 2", "signal 3"],
  "historicalContext": "Specific analog with year and outcome",
  "bearCase": "What could make this wrong",
  "entryTrigger": "Specific price/event that confirms trade (for WATCH)",
  "confidence": 75,
  "window": "2-3 weeks",
  "urgencyReason": "Why this urgency level"
}

Return ONLY valid JSON array. No markdown. No preamble. No trailing commas. No single quotes. All property names must be double-quoted.`;

const EVENTS_PROMPT = `You are a global market intelligence analyst.

Identify the TOP 5-8 market-moving events happening RIGHT NOW globally.
For each event identify what happened, which assets are affected, and urgency.

Return JSON array:
[{
  "title": "Event headline (max 10 words)",
  "region": "Middle East or Asia-Pacific or Europe or Americas or Africa or Global",
  "impactLevel": "critical or high or medium or low",
  "detail": "2-3 sentences with specific data",
  "affectedAssets": ["Brent Crude", "LNG Freight"],
  "direction": "bullish or bearish or mixed",
  "timeContext": "Breaking or Today or This week or Developing"
}]

Only real current events. Return ONLY valid JSON array. No markdown. No preamble. No trailing commas. No single quotes. All property names must be double-quoted.`;

const SUMMARY_PROMPT = `You are the Alpha Lens morning briefing writer.
Write a 3-4 sentence executive summary of today's top recommendations.
Sound like a sharp trading desk morning note. Be specific about assets and edge sizes.
Return plain text only. 3-4 sentences max.`;

interface RawRecommendation {
  type: string;
  urgency: string;
  title: string;
  assetTitle?: string;
  sector?: string;
  direction: string;
  headline: string;
  why: string[];
  historicalContext: string;
  bearCase: string;
  entryTrigger: string;
  confidence: number;
  window: string;
  urgencyReason: string;
}

interface RawEvent {
  title: string;
  region: string;
  impactLevel: string;
  detail: string;
  affectedAssets: string[];
  direction: string;
  timeContext: string;
}

function safeParseJSONArray<T>(text: string): T[] {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed as T[];
    return [];
  } catch {
    // fallback
  }

  try {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed as T[];
    }
  } catch {
    // fallback
  }

  const truncated = tryRecoverTruncatedArray<T>(cleaned);
  if (truncated.length > 0) {
    logger.info(
      { recovered: truncated.length },
      "Recovered items from truncated JSON array"
    );
    return truncated;
  }

  logger.warn(
    { preview: cleaned.slice(0, 200) },
    "Failed to parse JSON array from AI response, returning empty array"
  );
  return [];
}

function tryRecoverTruncatedArray<T>(text: string): T[] {
  const items: T[] = [];
  const arrayStart = text.indexOf("[");
  if (arrayStart === -1) return items;

  let content = text.slice(arrayStart + 1);
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{" && depth === 0) {
      objStart = i;
      depth = 1;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        const objStr = content.slice(objStart, i + 1);
        try {
          items.push(JSON.parse(objStr) as T);
        } catch {
          // skip malformed object
        }
        objStart = -1;
      }
    }
  }
  return items;
}

let scanLock = false;

export async function scanForRecommendations() {
  if (scanLock) {
    logger.warn("E6: Scan already in progress, skipping");
    return { id: null, summary: "Scan already running", tradeCount: 0, watchCount: 0, recommendations: [], events: [] };
  }
  scanLock = true;
  try {
    return await _doScan();
  } finally {
    scanLock = false;
  }
}

async function _doScan() {
  logger.info("E6: Starting recommendations scan...");

  const assets = await db
    .select()
    .from(assetsTable)
    .orderBy(desc(assetsTable.currentPrice))
    .limit(30);



  const signals = await db
    .select()
    .from(signalsTable)
    .orderBy(desc(signalsTable.createdAt))
    .limit(50);




  const events = await scanGlobalEvents();

  const macroContext = await fetchMacroContext();

  let smartMoneySummary = "";
  if (process.env.UNUSUAL_WHALES_KEY) {
    try {
      const [optionsFlow, darkPool, congressTrades] = await Promise.allSettled([
        fetchOptionsFlowAlerts(),
        fetchDarkPoolAlerts(),
        fetchCongressionalTrades(),
      ]);

      const flowLines = optionsFlow.status === "fulfilled"
        ? optionsFlow.value.slice(0, 5).map((a) => `  - ${a.title} (${a.note?.split(".")[0] || ""})`)
        : [];
      const dpLines = darkPool.status === "fulfilled"
        ? darkPool.value.slice(0, 3).map((a) => `  - ${a.title}`)
        : [];
      const congressLines = congressTrades.status === "fulfilled"
        ? congressTrades.value.slice(0, 3).map((a) => `  - ${a.title}`)
        : [];

      if (flowLines.length > 0 || dpLines.length > 0 || congressLines.length > 0) {
        smartMoneySummary = `\n\nSMART MONEY SIGNALS (Unusual Whales):
Options Flow:\n${flowLines.join("\n") || "  - None detected"}
Dark Pool:\n${dpLines.join("\n") || "  - None detected"}
Congress:\n${congressLines.join("\n") || "  - None detected"}`;
      }
    } catch (e: any) {
      logger.warn({ err: e.message }, "E6: Failed to fetch smart money for recommendations");
    }
  }

  const recs = await generateRecommendations(assets, signals, events, smartMoneySummary, macroContext);


  const summary = await generateBriefingSummary(recs);

  
  const [lastBriefing] = await db
    .select({ scanNumber: dailyBriefingsTable.scanNumber })
    .from(dailyBriefingsTable)
    .orderBy(desc(dailyBriefingsTable.id))
    .limit(1);
  const nextScanNumber = (lastBriefing?.scanNumber ?? 0) + 1;

  const [briefing] = await db
    .insert(dailyBriefingsTable)
    .values({
      summary,
      tradeCount: recs.filter((r) => r.type === "trade").length,
      watchCount: recs.filter((r) => r.type === "watch").length,
      signalsProcessed: signals.length,
      scanNumber: nextScanNumber,
    })
    .returning();



  for (const rec of recs) {
    const recTitle = (rec.assetTitle ?? "").toLowerCase();
    const matchedAsset = assets.find(
      (a) =>
        a.name.toLowerCase() === recTitle ||
        a.symbol.toLowerCase() === recTitle ||
        recTitle.includes(a.name.toLowerCase()) ||
        recTitle.includes(a.symbol.toLowerCase())
    );

    await db.insert(recommendationsTable).values({
      briefingId: briefing.id,
      type: rec.type,
      urgency: rec.urgency,
      title: rec.title,
      assetTitle: rec.assetTitle ?? "",
      assetClass: rec.sector ?? "",
      sector: rec.sector ?? "",
      direction: rec.direction,
      headline: rec.headline,
      why: rec.why,
      historicalContext: rec.historicalContext,
      bearCase: rec.bearCase,
      entryTrigger: rec.entryTrigger,
      confidence: rec.confidence,
      window: rec.window,
      urgencyReason: rec.urgencyReason,
      edge: matchedAsset?.edge ?? matchedAsset?.alphaScore ?? 0,
      aiProbability: matchedAsset?.aiProbability ?? 0,
      marketPrice: matchedAsset?.marketProbability ?? matchedAsset?.currentPrice ?? 0,
    });
  }

  for (const event of events) {
    await db.insert(globalEventsTable).values({
      title: event.title,
      region: event.region,
      impactLevel: event.impactLevel,
      detail: event.detail,
      affectedAssets: event.affectedAssets,
      direction: event.direction,
      timeContext: event.timeContext,
    });
  }

  logger.info(
    { trades: briefing.tradeCount, watches: briefing.watchCount },
    "E6: Briefing generated"
  );

  return {
    id: briefing.id,
    summary,
    tradeCount: briefing.tradeCount,
    watchCount: briefing.watchCount,
    recommendations: recs,
    events,
  };
}

async function scanGlobalEvents(): Promise<RawEvent[]> {
  try {
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: EVENTS_PROMPT,
      messages: [
        {
          role: "user",
          content: `Today is ${today}. What are the top 6 market-moving events right now globally? Focus on energy, geopolitics, central bank signals, commodity supply, crypto regulation, and equity markets.`,
        },
      ],
    });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        return safeParseJSONArray<RawEvent>(block.text);
      }
    }
  } catch (e: any) {
    logger.error({ err: e.message }, "E6: Failed to scan global events");
  }
  return [];
}

async function generateRecommendations(
  assets: (typeof assetsTable.$inferSelect)[],
  signals: (typeof signalsTable.$inferSelect)[],
  events: RawEvent[],
  smartMoneySummary: string = "",
  macroContext: string = ""
): Promise<RawRecommendation[]> {
  if (assets.length === 0) return [];

  const assetSummary = assets
    .map(
      (a) =>
        `- ${a.name} (${a.symbol}) | sector=${a.sector} | price=$${a.currentPrice} | 24h=${a.priceChange24h}% | AI prob=${a.aiProbability ?? "N/A"}% | Mkt prob=${a.marketProbability ?? "N/A"}%`
    )
    .join("\n");

  const signalSummary = signals
    .slice(0, 20)
    .map(
      (s) =>
        `- [${s.type}] ${s.headline} | impact=${s.impact} | direction=${s.direction} | confidence=${s.confidence}`
    )
    .join("\n");

  const eventSummary = events
    .map(
      (e) =>
        `- [${e.region}] ${e.title} — Impact: ${e.impactLevel} — Affects: ${e.affectedAssets.join(", ")}`
    )
    .join("\n");

  const prompt = `Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

SCORED ASSETS:
${assetSummary}

RECENT SIGNALS:
${signalSummary || "None available yet"}

GLOBAL EVENTS:
${eventSummary || "None available yet"}${smartMoneySummary}${macroContext ? `\n\n${macroContext}` : ""}

Identify the best trade calls and watches. Cross-reference assets with events and signals.${smartMoneySummary ? " Pay close attention to smart money signals — large institutional options bets and congressional trades often foreshadow major moves." : ""}${macroContext ? " Factor the macro context (rates, inflation, unemployment, yield curve) into directional conviction." : ""}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: AGENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        return safeParseJSONArray<RawRecommendation>(block.text);
      }
    }
  } catch (e: any) {
    logger.error({ err: e.message }, "E6: Failed to generate recommendations");
  }
  return [];
}

async function generateBriefingSummary(
  recs: RawRecommendation[]
): Promise<string> {
  if (recs.length === 0) {
    return "No significant opportunities identified in this scan. Markets appear fairly priced.";
  }

  try {
    
    const recText = recs
      .slice(0, 5)
      .map(
        (r) =>
          `- [${r.type.toUpperCase()}] ${r.title} | Confidence: ${r.confidence}%`
      )
      .join("\n");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: SUMMARY_PROMPT,
      messages: [
        { role: "user", content: `Today's recommendations:\n${recText}` },
      ],
    });
    

    for (const block of response.content) {
      if (block.type === "text") return block.text.trim();
    }
  } catch (e: any) {
    logger.error({ err: e.message }, "E6: Failed to generate summary");
  }

  const top = recs[0];
  return `Today's scan identified ${recs.length} opportunities. Top call: ${top.title} at ${top.confidence}% confidence.`;
}

export async function getCurrentBriefing() {
  const [briefing] = await db
    .select()
    .from(dailyBriefingsTable)
    .orderBy(desc(dailyBriefingsTable.generatedAt))
    .limit(1);

  if (!briefing) return null;

  const recs = await db
    .select()
    .from(recommendationsTable)
    .where(eq(recommendationsTable.briefingId, briefing.id))
    .orderBy(desc(recommendationsTable.confidence));

  const events = await db
    .select()
    .from(globalEventsTable)
    .orderBy(desc(globalEventsTable.scannedAt))
    .limit(8);

  return {
    ...briefing,
    recommendations: recs,
    globalEvents: events,
  };
}
