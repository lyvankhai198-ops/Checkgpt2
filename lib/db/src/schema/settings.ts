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
  // Payment / bank config
  bankName: text("bank_name").default("MB Bank"),
  bankBin: text("bank_bin").default("MB"),         // VietQR bank ID
  bankAccount: text("bank_account"),
  bankHolder: text("bank_holder"),
  paymentEnabled: integer("payment_enabled").default(0), // 0=off, 1=on (bool as int)
  sepayApiKey: text("sepay_api_key"),                   // stored masked, like bot token
  // USDT payment (manual)
  usdtWallet: text("usdt_wallet"),                      // TRC20 wallet address
  usdtRateVnd: integer("usdt_rate_vnd").default(25000), // VND per 1 USDT
  adminContact: text("admin_contact"),                  // e.g. "@myusername" or "https://t.me/myusername"
  proxyList: text("proxy_list"),                        // newline-separated proxy URLs, e.g. http://user:pass@host:port
  maintenanceMode: integer("maintenance_mode").default(0), // 0 = off, 1 = on
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settingsTable.$inferSelect;
export type InsertSettings = typeof settingsTable.$inferInsert;
