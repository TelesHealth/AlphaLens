import { pgTable, serial, text, doublePrecision, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  sector: text("sector").notNull().default("prediction"),
  currentPrice: doublePrecision("current_price"),
  priceChange24h: doublePrecision("price_change_24h"),
  alphaScore: doublePrecision("alpha_score"),
  aiProbability: doublePrecision("ai_probability"),
  marketProbability: doublePrecision("market_probability"),
  edge: doublePrecision("edge"),
  direction: text("direction"),
  lastScoredAt: timestamp("last_scored_at"),
  aiSummary: text("ai_summary"),
  tradingBloc: text("trading_bloc"),
  riskLevel: text("risk_level"),
  description: text("description"),
  sourceUrl: text("source_url"),
  tags: jsonb("tags").$type<string[]>().default([]),
  region: text("region"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
