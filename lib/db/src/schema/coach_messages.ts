import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  doublePrecision,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const coachMessagesTable = pgTable(
  "coach_messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull(),
    content: text("content").notNull(),
    recommendations: jsonb("recommendations").$type<string[] | null>(),
    riskAssessment: text("risk_assessment"),
    confidence: doublePrecision("confidence"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userCreatedIdx: index("coach_messages_user_created_idx").on(
      t.userId,
      t.createdAt,
    ),
  }),
);

export type CoachMessageRow = typeof coachMessagesTable.$inferSelect;
export type InsertCoachMessage = typeof coachMessagesTable.$inferInsert;
