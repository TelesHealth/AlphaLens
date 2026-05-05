import { pgTable, serial, text, doublePrecision, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const dailyBriefingsTable = pgTable("daily_briefings", {
  id: serial("id").primaryKey(),
  summary: text("summary").default(""),
  tradeCount: integer("trade_count").default(0),
  watchCount: integer("watch_count").default(0),
  signalsProcessed: integer("signals_processed").default(0),
  scanNumber: integer("scan_number").default(1),
  generatedAt: timestamp("generated_at").defaultNow(),
});

export const recommendationsTable = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  briefingId: integer("briefing_id").references(() => dailyBriefingsTable.id),
  type: text("type").notNull(),
  urgency: text("urgency").default("medium"),
  title: text("title").notNull(),
  assetId: integer("asset_id"),
  assetTitle: text("asset_title").default(""),
  assetClass: text("asset_class").default(""),
  sector: text("sector").default(""),
  region: text("region").default(""),
  direction: text("direction").default("WATCH"),
  aiProbability: doublePrecision("ai_probability"),
  marketPrice: doublePrecision("market_price"),
  assetPriceAtCall: doublePrecision("asset_price_at_call"),
  edge: doublePrecision("edge"),
  edgeType: text("edge_type"),
  convictionScore: doublePrecision("conviction_score"),
  edgeCalculatedAt: timestamp("edge_calculated_at").defaultNow(),
  headline: text("headline").default(""),
  why: jsonb("why").default([]),
  historicalContext: text("historical_context").default(""),
  bearCase: text("bear_case").default(""),
  entryTrigger: text("entry_trigger").default(""),
  confidence: integer("confidence").default(60),
  window: text("window").default(""),
  urgencyReason: text("urgency_reason").default(""),
  sources: jsonb("sources").default([]),
  outcome: text("outcome"),
  resolutionDate: timestamp("resolution_date"),
  resolutionNote: text("resolution_note"),
  marketPriceAtResolution: doublePrecision("market_price_at_resolution"),
  paperReturn: doublePrecision("paper_return"),
  resolutionMethod: text("resolution_method"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const globalEventsTable = pgTable("global_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  region: text("region").default(""),
  impactLevel: text("impact_level").default("medium"),
  detail: text("detail").default(""),
  affectedAssets: jsonb("affected_assets").default([]),
  direction: text("direction").default("mixed"),
  timeContext: text("time_context").default(""),
  scannedAt: timestamp("scanned_at").defaultNow(),
});

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  assetId: integer("asset_id"),
  assetTitle: text("asset_title").default(""),
  assetClass: text("asset_class").default(""),
  alertEdgeThreshold: doublePrecision("alert_edge_threshold").default(5.0),
  notes: text("notes").default(""),
  addedAt: timestamp("added_at").defaultNow(),
});
