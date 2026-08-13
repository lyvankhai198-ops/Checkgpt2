import {
  pgTable, serial, text, integer, boolean, timestamp, date, index,
} from "drizzle-orm/pg-core";

export const licenseKeysTable = pgTable("license_keys", {
  id: serial("id").primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  keyDisplay: text("key_display").notNull(),
  status: text("status", {
    enum: ["inactive", "active", "expired", "locked", "revoked"],
  }).notNull().default("inactive"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  maxTotalUses: integer("max_total_uses"),
  dailyLimit: integer("daily_limit"),
  maxConcurrent: integer("max_concurrent").notNull().default(1),
  allowedTelegramId: text("allowed_telegram_id"),
  maxDevices: integer("max_devices").notNull().default(1),
  lockToTelegram: boolean("lock_to_telegram").notNull().default(false),
  activatedTelegramId: text("activated_telegram_id"),
  totalUses: integer("total_uses").notNull().default(0),
  dailyUses: integer("daily_uses").notNull().default(0),
  dailyUsesDate: date("daily_uses_date"),
  currentConcurrent: integer("current_concurrent").notNull().default(0),
  note: text("note"),
  plan: text("plan"),   // any plan slug — not limited to basic/pro
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("license_keys_status_idx").on(t.status),
  index("license_keys_plan_idx").on(t.plan),
  index("license_keys_status_plan_idx").on(t.status, t.plan),
  index("license_keys_created_at_idx").on(t.createdAt),
  index("license_keys_expires_at_idx").on(t.expiresAt),
  index("license_keys_activated_telegram_id_idx").on(t.activatedTelegramId),
]);

export type LicenseKey = typeof licenseKeysTable.$inferSelect;
export type InsertLicenseKey = typeof licenseKeysTable.$inferInsert;
