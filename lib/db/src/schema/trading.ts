import { pgTable, serial, text, doublePrecision, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { recommendationsTable } from "./recommendations";
import { usersTable } from "./users";

export const liveTradesTable = pgTable("live_trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  recommendationId: integer("recommendation_id").references(() => recommendationsTable.id),
  platform: text("platform").notNull().default("paper"),
  assetId: text("asset_id").default(""),
  assetTitle: text("asset_title").default(""),
  direction: text("direction").notNull().default("YES"),
  amountUsd: doublePrecision("amount_usd").notNull().default(0),
  price: doublePrecision("price"),
  size: doublePrecision("size"),
  status: text("status").notNull().default("filled"),
  paperMode: boolean("paper_mode").default(true),
  aiProbability: doublePrecision("ai_probability"),
  aiEdge: doublePrecision("ai_edge"),
  confidence: integer("confidence"),
  orderId: text("order_id"),
  ticker: text("ticker").default(""),
  executedAt: timestamp("executed_at").defaultNow(),
});

export const pendingOrdersTable = pgTable("pending_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  recommendationId: integer("recommendation_id").references(() => recommendationsTable.id),
  recTitle: text("rec_title").default(""),
  assetId: text("asset_id").default(""),
  direction: text("direction").default("YES"),
  amountUsd: doublePrecision("amount_usd").notNull().default(0),
  platform: text("platform").default("paper"),
  platformReason: text("platform_reason").default(""),
  aiProbability: doublePrecision("ai_probability"),
  edge: doublePrecision("edge"),
  confidence: integer("confidence"),
  status: text("status").notNull().default("pending_approval"),
  createdAt: timestamp("created_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
});

export type LiveTrade = typeof liveTradesTable.$inferSelect;
export type PendingOrder = typeof pendingOrdersTable.$inferSelect;
