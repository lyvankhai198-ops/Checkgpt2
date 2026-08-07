import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),          // "basic" | "pro"
  name: text("name").notNull(),                   // "Basic", "Pro"
  emoji: text("emoji").notNull().default("🟢"),
  enabled: boolean("enabled").notNull().default(true),
  price: integer("price").notNull(),              // VND
  description: text("description").notNull().default(""),  // hiển thị trong bot
  durationDays: integer("duration_days"),         // null = không hết hạn
  maxTotalUses: integer("max_total_uses"),        // null = không giới hạn
  dailyLimit: integer("daily_limit"),             // null = không giới hạn
  maxConcurrent: integer("max_concurrent").notNull().default(1),
  bulkEnabled: boolean("bulk_enabled").notNull().default(false),
  maxBulkLines: integer("max_bulk_lines").notNull().default(10), // max accounts per bulk submission
  color: text("color"),                                          // hex accent color e.g. "#6366f1"
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Plan = typeof plansTable.$inferSelect;
export type InsertPlan = typeof plansTable.$inferInsert;
