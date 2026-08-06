import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  username: text("username"),
  plan: text("plan").notNull(), // any plan slug (basic, pro, etc.)
  amount: integer("amount").notNull(),            // VND price at order time
  orderCode: text("order_code").notNull().unique(), // unique code embedded in transfer description
  status: text("status", {
    enum: ["pending", "paid", "delivered", "failed", "expired"],
  }).notNull().default("pending"),
  keyId: integer("key_id"),                       // assigned key after payment
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // order expires if not paid in time
});

export type Order = typeof ordersTable.$inferSelect;
export type InsertOrder = typeof ordersTable.$inferInsert;
