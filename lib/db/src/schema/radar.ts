import { pgTable, text, doublePrecision, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

export const radarAlertsTable = pgTable("radar_alerts", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  severity: text("severity").default("medium"),
  assetId: text("asset_id").default(""),
  assetLabel: text("asset_label").default(""),
  title: text("title").notNull(),
  pctChange: doublePrecision("pct_change"),
  direction: text("direction").default(""),
  priceStart: doublePrecision("price_start"),
  priceNow: doublePrecision("price_now"),
  windowMinutes: integer("window_minutes"),
  thresholdPct: doublePrecision("threshold_pct"),
  volumeMultiplier: doublePrecision("volume_multiplier"),
  volumeType: text("volume_type").default(""),
  confidence: integer("confidence"),
  reason: text("reason").default(""),
  triggerAsset: text("trigger_asset").default(""),
  triggerPct: doublePrecision("trigger_pct"),
  chainAssets: jsonb("chain_assets").$type<string[]>().default([]),
  historicalNote: text("historical_note").default(""),
  aiScanning: text("ai_scanning").default(""),
  note: text("note").default(""),
  dataSource: text("data_source").default(""),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_radar_alerts_created").on(table.createdAt),
  index("idx_radar_alerts_type").on(table.type, table.createdAt),
  index("idx_radar_alerts_severity").on(table.severity, table.createdAt),
]);

export type RadarAlert = typeof radarAlertsTable.$inferSelect;
export type NewRadarAlert = typeof radarAlertsTable.$inferInsert;
