import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const usageLogsTable = pgTable("usage_logs", {
  id: serial("id").primaryKey(),
  keyId: integer("key_id"),
  userId: integer("user_id"),
  telegramId: text("telegram_id"),
  action: text("action").notNull(),
  result: text("result"),
  errorMessage: text("error_message"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UsageLog = typeof usageLogsTable.$inferSelect;
export type InsertUsageLog = typeof usageLogsTable.$inferInsert;
