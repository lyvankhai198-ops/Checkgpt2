import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { licenseKeysTable } from "./licenseKeys";

export const keyActivationsTable = pgTable("key_activations", {
  id: serial("id").primaryKey(),
  keyId: integer("key_id").notNull().references(() => licenseKeysTable.id, { onDelete: "cascade" }),
  telegramId: text("telegram_id").notNull(),
  userId: integer("user_id"),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  deviceInfo: text("device_info"),
  ipAddress: text("ip_address"),
});

export type KeyActivation = typeof keyActivationsTable.$inferSelect;
export type InsertKeyActivation = typeof keyActivationsTable.$inferInsert;
