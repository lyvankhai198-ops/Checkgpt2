import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

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
}, (t) => [
  index("usage_logs_created_at_idx").on(t.createdAt),
  index("usage_logs_telegram_id_idx").on(t.telegramId),
  index("usage_logs_action_idx").on(t.action),
  index("usage_logs_key_id_idx").on(t.keyId),
]);

export type UsageLog = typeof usageLogsTable.$inferSelect;
export type InsertUsageLog = typeof usageLogsTable.$inferInsert;
