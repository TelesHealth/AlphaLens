import { pgTable, serial, varchar, boolean, timestamp, integer, text, uniqueIndex } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const userTradingAccountsTable = pgTable(
  "user_trading_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("configured"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    userPlatformUniq: uniqueIndex("user_trading_accounts_user_platform_uniq").on(t.userId, t.platform),
  }),
);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
export type UserTradingAccount = typeof userTradingAccountsTable.$inferSelect;
