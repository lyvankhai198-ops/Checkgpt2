import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: integer("id").notNull().default(1).primaryKey(),
  telegramBotToken: text("telegram_bot_token"),
  timezone: text("timezone").notNull().default("UTC"),
  defaultDurationMinutes: integer("default_duration_minutes").default(1440),
  defaultMaxUses: integer("default_max_uses"),
  defaultDailyLimit: integer("default_daily_limit"),
  defaultMaxConcurrent: integer("default_max_concurrent").default(1),
  notifyExpiryDays: integer("notify_expiry_days").default(3),
  welcomeMessage: text("welcome_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settingsTable.$inferSelect;
export type InsertSettings = typeof settingsTable.$inferInsert;
