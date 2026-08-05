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
  // Pricing (VND)
  basicPrice: integer("basic_price").default(20000),
  proPrice: integer("pro_price").default(99000),
  // Auto-stock targets
  basicStockTarget: integer("basic_stock_target").default(50),
  proStockTarget: integer("pro_stock_target").default(20),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settingsTable.$inferSelect;
export type InsertSettings = typeof settingsTable.$inferInsert;
