import { pgTable, serial, text, doublePrecision, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assetsTable } from "./assets";

export const signalsTable = pgTable("signals", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assetsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("fundamental"),
  source: text("source").notNull(),
  headline: text("headline").notNull(),
  detail: text("detail"),
  impact: text("impact").notNull().default("medium"),
  direction: text("direction").notNull().default("neutral"),
  confidence: doublePrecision("confidence").notNull().default(0.5),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSignalSchema = createInsertSchema(signalsTable).omit({ id: true });
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;
