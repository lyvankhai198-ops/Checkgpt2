/**
 * Seed script — creates the first admin account from environment variables.
 * Run with: pnpm --filter @workspace/scripts run seed:admin
 *
 * Required env vars:
 *   ADMIN_USERNAME — admin login name  (default: admin)
 *   ADMIN_PASSWORD — admin password    (no default, must be set)
 *   DATABASE_URL   — postgres connection string
 */

import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { adminsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const username = process.env.ADMIN_USERNAME ?? "admin";
const password = process.env.ADMIN_PASSWORD;

if (!password) {
  console.error("❌  ADMIN_PASSWORD env var is required");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

const existing = await db
  .select({ id: adminsTable.id })
  .from(adminsTable)
  .where(eq(adminsTable.username, username))
  .limit(1);

if (existing[0]) {
  console.log(`ℹ️  Admin '${username}' already exists (id=${existing[0].id}), skipping.`);
} else {
  const [admin] = await db
    .insert(adminsTable)
    .values({ username, passwordHash })
    .returning();
  console.log(`✅  Admin created: ${username} (id=${admin.id})`);
}

// Seed default settings row
const [existingSettings] = await db
  .select({ id: settingsTable.id })
  .from(settingsTable)
  .where(eq(settingsTable.id, 1))
  .limit(1);

if (!existingSettings) {
  await db.insert(settingsTable).values({
    id: 1,
    timezone: "UTC",
    defaultDurationMinutes: 1440,
    defaultMaxConcurrent: 1,
    notifyExpiryDays: 3,
    welcomeMessage: "Chào mừng đến với GPT Checker Bot! Nhập /help để xem hướng dẫn.",
  });
  console.log("✅  Default settings seeded.");
}

process.exit(0);
