import { pgTable, serial, text, doublePrecision, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assetsTable } from "./assets";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assetsTable.id),
  assetName: text("asset_name").notNull(),
  assetSymbol: text("asset_symbol").notNull(),
  direction: text("direction").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  exitPrice: doublePrecision("exit_price"),
  quantity: doublePrecision("quantity").notNull(),
  pnl: doublePrecision("pnl"),
  pnlPercent: doublePrecision("pnl_percent"),
  status: text("status").notNull().default("open"),
  aiReasoning: text("ai_reasoning"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export const portfolioTable = pgTable("portfolio", {
  id: serial("id").primaryKey(),
  balance: doublePrecision("balance").notNull().default(10000),
  initialBalance: doublePrecision("initial_balance").notNull().default(10000),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
export type Portfolio = typeof portfolioTable.$inferSelect;
