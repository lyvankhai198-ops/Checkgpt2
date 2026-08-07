/**
 * Key Service — core business logic for license key lifecycle.
 * Handles create, validate, activate, use, release, and admin operations.
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, sql, lt, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  licenseKeysTable, keyActivationsTable, usageLogsTable, auditLogsTable,
  usersTable, settingsTable,
  type LicenseKey, type InsertLicenseKey,
} from "@workspace/db";
import { logger } from "./logger.js";

const BCRYPT_ROUNDS = 10;
const FREE_TRIAL_LIMIT = 3;

// ─── In-memory brute-force tracker ──────────────────────────────────────────
interface BfEntry { count: number; lockedUntil?: Date }
const bfMap = new Map<string, BfEntry>();
const BF_MAX_ATTEMPTS = 5;
const BF_LOCK_MS = 15 * 60 * 1000; // 15 minutes

function checkBruteForce(identifier: string): { blocked: boolean; retryAfter?: Date } {
  const entry = bfMap.get(identifier);
  if (!entry) return { blocked: false };
  if (entry.lockedUntil && entry.lockedUntil > new Date()) {
    return { blocked: true, retryAfter: entry.lockedUntil };
  }
  if (entry.lockedUntil && entry.lockedUntil <= new Date()) {
    bfMap.delete(identifier);
  }
  return { blocked: false };
}

function recordBfFail(identifier: string): void {
  const entry = bfMap.get(identifier) ?? { count: 0 };
  entry.count++;
  if (entry.count >= BF_MAX_ATTEMPTS) {
    entry.lockedUntil = new Date(Date.now() + BF_LOCK_MS);
    logger.warn({ identifier }, "Key brute-force detected, temporary lock applied");
  }
  bfMap.set(identifier, entry);
}

function clearBfEntry(identifier: string): void {
  bfMap.delete(identifier);
}

// ─── Key generation ──────────────────────────────────────────────────────────

/** Generate a raw key string in format KGPT-XXXX-XXXX-XXXX */
export function generateRawKey(): string {
  const part = () => crypto.randomBytes(3).toString("hex").toUpperCase();
  return `KGPT-${part()}-${part()}-${part()}`;
}

export interface CreateKeyOptions {
  durationMinutes?: number;   // overrides explicit expiresAt
  expiresAt?: Date;           // explicit expiry date
  neverExpires?: boolean;     // if true, no expiry
  maxTotalUses?: number;
  dailyLimit?: number;
  maxConcurrent?: number;
  allowedTelegramId?: string;
  maxDevices?: number;
  lockToTelegram?: boolean;
  note?: string;
  plan?: string;              // plan slug for inventory management
  count?: number;             // batch create N keys
}

export interface CreatedKey {
  rawKey: string;
  keyDisplay: string;
  id: number;
}

export async function createKeys(opts: CreateKeyOptions = {}): Promise<CreatedKey[]> {
  const count = Math.max(1, opts.count ?? 1);

  let expiresAt: Date | undefined;
  if (!opts.neverExpires) {
    if (opts.expiresAt) {
      expiresAt = opts.expiresAt;
    } else if (opts.durationMinutes) {
      expiresAt = new Date(Date.now() + opts.durationMinutes * 60 * 1000);
    }
  }

  const results: CreatedKey[] = [];
  for (let i = 0; i < count; i++) {
    const rawKey = generateRawKey();
    const keyHash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);
    // Store the full key as keyDisplay so admins can copy/send it later.
    // Security: bcrypt hash is still used for validation; keyDisplay is for admin dashboard only.
    const keyDisplay = rawKey;

    const [row] = await db
      .insert(licenseKeysTable)
      .values({
        keyHash,
        keyDisplay,
        status: "inactive",
        expiresAt: expiresAt ?? null,
        maxTotalUses: opts.maxTotalUses ?? null,
        dailyLimit: opts.dailyLimit ?? null,
        maxConcurrent: opts.maxConcurrent ?? 1,
        allowedTelegramId: opts.allowedTelegramId ?? null,
        maxDevices: opts.maxDevices ?? 1,
        lockToTelegram: opts.lockToTelegram ?? false,
        note: opts.note ?? null,
        plan: opts.plan ?? null,
      } satisfies Omit<InsertLicenseKey, "status"> & { status: "inactive" })
      .returning();

    results.push({ rawKey, keyDisplay, id: row.id });
  }
  return results;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type ValidateReason =
  | "valid"
  | "not_found"
  | "revoked"
  | "locked"
  | "expired"
  | "max_uses_reached"
  | "daily_limit_reached"
  | "concurrency_limit"
  | "telegram_mismatch"
  | "brute_force_locked";

export interface ValidateResult {
  valid: boolean;
  reason: ValidateReason;
  key?: LicenseKey;
  retryAfter?: Date;
}

async function findKeyByRaw(rawKey: string): Promise<LicenseKey | null> {
  // Keys are bcrypt-hashed → must scan all active/inactive keys and compare
  // This is O(N). For production scale add a fast lookup index (first 8 chars).
  const candidates = await db
    .select()
    .from(licenseKeysTable)
    .where(
      sql`status NOT IN ('revoked')`,
    )
    .limit(500);

  for (const k of candidates) {
    if (await bcrypt.compare(rawKey, k.keyHash)) return k;
  }
  return null;
}

/** Reset daily counters if it's a new calendar day */
async function maybeResetDaily(key: LicenseKey): Promise<LicenseKey> {
  const today = new Date().toISOString().slice(0, 10);
  if (key.dailyUsesDate !== today && key.dailyUses > 0) {
    const [updated] = await db
      .update(licenseKeysTable)
      .set({ dailyUses: 0, dailyUsesDate: today, updatedAt: new Date() })
      .where(eq(licenseKeysTable.id, key.id))
      .returning();
    return updated;
  }
  return key;
}

export async function validateKey(
  rawKey: string,
  opts: { telegramId?: string; checkConcurrency?: boolean } = {},
): Promise<ValidateResult> {
  const identifier = opts.telegramId ?? rawKey.slice(0, 8);
  const bf = checkBruteForce(identifier);
  if (bf.blocked) {
    return { valid: false, reason: "brute_force_locked", retryAfter: bf.retryAfter };
  }

  let key = await findKeyByRaw(rawKey);
  if (!key) {
    recordBfFail(identifier);
    return { valid: false, reason: "not_found" };
  }

  clearBfEntry(identifier);
  key = await maybeResetDaily(key);

  if (key.status === "revoked") return { valid: false, reason: "revoked", key };
  if (key.status === "locked") return { valid: false, reason: "locked", key };

  if (key.expiresAt && key.expiresAt < new Date()) {
    if (key.status !== "expired") {
      await db.update(licenseKeysTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(licenseKeysTable.id, key.id));
      key = { ...key, status: "expired" };
    }
    return { valid: false, reason: "expired", key };
  }

  if (key.maxTotalUses !== null && key.totalUses >= key.maxTotalUses) {
    return { valid: false, reason: "max_uses_reached", key };
  }

  if (key.dailyLimit !== null && key.dailyUses >= key.dailyLimit) {
    return { valid: false, reason: "daily_limit_reached", key };
  }

  if (opts.checkConcurrency && key.currentConcurrent >= key.maxConcurrent) {
    return { valid: false, reason: "concurrency_limit", key };
  }

  if (opts.telegramId && key.lockToTelegram && key.activatedTelegramId) {
    if (key.activatedTelegramId !== opts.telegramId) {
      return { valid: false, reason: "telegram_mismatch", key };
    }
  }

  if (opts.telegramId && key.allowedTelegramId && key.allowedTelegramId !== opts.telegramId) {
    return { valid: false, reason: "telegram_mismatch", key };
  }

  return { valid: true, reason: "valid", key };
}

// ─── Validate by key ID (no raw key needed — for session restore) ─────────────

export async function validateKeyById(
  keyId: number,
  opts: { telegramId?: string; checkConcurrency?: boolean } = {},
): Promise<ValidateResult> {
  let key = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, keyId)).limit(1).then(r => r[0] ?? null);
  if (!key) return { valid: false, reason: "not_found" };

  key = await maybeResetDaily(key);

  if (key.status === "revoked") return { valid: false, reason: "revoked", key };
  if (key.status === "locked")  return { valid: false, reason: "locked",  key };

  if (key.expiresAt && key.expiresAt < new Date()) {
    if (key.status !== "expired") {
      await db.update(licenseKeysTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(licenseKeysTable.id, key.id));
      key = { ...key, status: "expired" };
    }
    return { valid: false, reason: "expired", key };
  }

  if (key.maxTotalUses !== null && key.totalUses >= key.maxTotalUses)
    return { valid: false, reason: "max_uses_reached", key };

  if (key.dailyLimit !== null && key.dailyUses >= key.dailyLimit)
    return { valid: false, reason: "daily_limit_reached", key };

  if (opts.checkConcurrency && key.currentConcurrent >= key.maxConcurrent)
    return { valid: false, reason: "concurrency_limit", key };

  if (opts.telegramId && key.lockToTelegram && key.activatedTelegramId
      && key.activatedTelegramId !== opts.telegramId)
    return { valid: false, reason: "telegram_mismatch", key };

  if (opts.telegramId && key.allowedTelegramId
      && key.allowedTelegramId !== opts.telegramId)
    return { valid: false, reason: "telegram_mismatch", key };

  return { valid: true, reason: "valid", key };
}

// ─── Activation ──────────────────────────────────────────────────────────────

export interface ActivateResult {
  success: boolean;
  reason?: string;
  key?: LicenseKey;
}

export async function activateKey(
  rawKey: string,
  telegramId: string,
  opts: { deviceInfo?: string; ipAddress?: string; userId?: number } = {},
): Promise<ActivateResult> {
  const result = await validateKey(rawKey, { telegramId });
  if (!result.valid || !result.key) {
    return { success: false, reason: result.reason };
  }

  const key = result.key;

  // Lock to telegram_id on first activation
  const updates: Partial<LicenseKey> = {
    status: "active",
    updatedAt: new Date(),
  };
  if (key.lockToTelegram && !key.activatedTelegramId) {
    (updates as Record<string, unknown>).activatedTelegramId = telegramId;
  }

  const [updatedKey] = await db
    .update(licenseKeysTable)
    .set(updates)
    .where(eq(licenseKeysTable.id, key.id))
    .returning();

  // Record activation
  await db.insert(keyActivationsTable).values({
    keyId: key.id,
    telegramId,
    userId: opts.userId ?? null,
    deviceInfo: opts.deviceInfo ?? null,
    ipAddress: opts.ipAddress ?? null,
  });

  // Update user's current key
  if (telegramId) {
    await db
      .update(usersTable)
      .set({ currentKeyId: key.id, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
  }

  await logUsage({ keyId: key.id, telegramId, action: "activate", result: "success", ipAddress: opts.ipAddress });

  return { success: true, key: updatedKey };
}

// ─── Usage recording ─────────────────────────────────────────────────────────

export async function recordUse(
  keyId: number,
  telegramId?: string,
  ipAddress?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const today = new Date().toISOString().slice(0, 10);

  const [key] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, keyId)).limit(1);
  if (!key) return { ok: false, reason: "not_found" };

  // Reset daily if needed
  const resetDaily = key.dailyUsesDate !== today;

  await db
    .update(licenseKeysTable)
    .set({
      totalUses: sql`${licenseKeysTable.totalUses} + 1`,
      dailyUses: resetDaily ? 1 : sql`${licenseKeysTable.dailyUses} + 1`,
      dailyUsesDate: today,
      currentConcurrent: sql`${licenseKeysTable.currentConcurrent} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(licenseKeysTable.id, keyId));

  if (telegramId) {
    await db
      .update(usersTable)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
  }

  await logUsage({ keyId, telegramId, action: "use", result: "started", ipAddress });
  return { ok: true };
}

export async function releaseUse(keyId: number): Promise<void> {
  await db
    .update(licenseKeysTable)
    .set({
      currentConcurrent: sql`GREATEST(0, ${licenseKeysTable.currentConcurrent} - 1)`,
      updatedAt: new Date(),
    })
    .where(eq(licenseKeysTable.id, keyId));
}

// ─── Admin operations ────────────────────────────────────────────────────────

export async function revokeKey(keyId: number): Promise<void> {
  await db.update(licenseKeysTable)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(eq(licenseKeysTable.id, keyId));
}

export async function lockKey(keyId: number): Promise<void> {
  await db.update(licenseKeysTable)
    .set({ status: "locked", updatedAt: new Date() })
    .where(eq(licenseKeysTable.id, keyId));
}

export async function unlockKey(keyId: number): Promise<void> {
  // Unlock only if not expired or revoked
  const [key] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, keyId)).limit(1);
  if (!key) return;
  if (key.status === "revoked") return;
  const isExpired = key.expiresAt && key.expiresAt < new Date();
  await db.update(licenseKeysTable)
    .set({ status: isExpired ? "expired" : "active", updatedAt: new Date() })
    .where(eq(licenseKeysTable.id, keyId));
}

export async function extendKey(keyId: number, extraMinutes: number): Promise<void> {
  const [key] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, keyId)).limit(1);
  if (!key) return;

  const base = key.expiresAt && key.expiresAt > new Date() ? key.expiresAt : new Date();
  const newExpiry = new Date(base.getTime() + extraMinutes * 60 * 1000);
  const isExpired = newExpiry < new Date();

  await db.update(licenseKeysTable)
    .set({
      expiresAt: newExpiry,
      status: key.status === "revoked" ? "revoked" : key.status === "locked" ? "locked" : isExpired ? "expired" : "active",
      updatedAt: new Date(),
    })
    .where(eq(licenseKeysTable.id, keyId));
}

export async function setKeyExpiry(keyId: number, expiresAt: Date): Promise<void> {
  const isExpired = expiresAt < new Date();
  await db.update(licenseKeysTable)
    .set({
      expiresAt,
      status: isExpired ? "expired" : "active",
      updatedAt: new Date(),
    })
    .where(eq(licenseKeysTable.id, keyId));
}

// ─── Trial management ────────────────────────────────────────────────────────

export async function getOrCreateUser(telegramId: string, info?: { username?: string; firstName?: string }) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  if (existing[0]) {
    // Update name fields if we have fresh info and the stored values are missing
    const needsUpdate =
      (info?.username && !existing[0].username) ||
      (info?.firstName && !existing[0].firstName);
    if (needsUpdate) {
      const [updated] = await db
        .update(usersTable)
        .set({
          ...(info?.username   ? { username:   info.username }   : {}),
          ...(info?.firstName  ? { firstName:  info.firstName }  : {}),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.telegramId, telegramId))
        .returning();
      return updated;
    }
    return existing[0];
  }

  const [created] = await db.insert(usersTable).values({
    telegramId,
    username: info?.username ?? null,
    firstName: info?.firstName ?? null,
    trialCount: 0,
    language: null,   // always null so bot shows language selector on first /start
  }).returning();
  return created;
}

export async function incrementTrial(telegramId: string): Promise<number> {
  const [updated] = await db
    .update(usersTable)
    .set({ trialCount: sql`${usersTable.trialCount} + 1`, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, telegramId))
    .returning({ trialCount: usersTable.trialCount });
  return updated?.trialCount ?? 1;
}

export async function hasTrialLeft(telegramId: string): Promise<boolean> {
  const user = await db.select({ trialCount: usersTable.trialCount })
    .from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  return (user[0]?.trialCount ?? 0) < FREE_TRIAL_LIMIT;
}

export { FREE_TRIAL_LIMIT };

/** Reset a user's trial count to 0 so they can use the free trial again. */
export async function resetUserTrial(telegramId: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ trialCount: 0, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, telegramId));
}

// ─── Logging helpers ─────────────────────────────────────────────────────────

export async function logUsage(data: {
  keyId?: number;
  userId?: number;
  telegramId?: string;
  action: string;
  result?: string;
  errorMessage?: string;
  ipAddress?: string;
}) {
  try {
    await db.insert(usageLogsTable).values({
      keyId: data.keyId ?? null,
      userId: data.userId ?? null,
      telegramId: data.telegramId ?? null,
      action: data.action,
      result: data.result ?? null,
      errorMessage: data.errorMessage ?? null,
      ipAddress: data.ipAddress ?? null,
    });
  } catch (e) {
    logger.error({ err: e }, "Failed to write usage log");
  }
}

export async function logAudit(data: {
  adminId?: number;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: unknown;
  ipAddress?: string;
}) {
  try {
    await db.insert(auditLogsTable).values({
      adminId: data.adminId ?? null,
      action: data.action,
      targetType: data.targetType ?? null,
      targetId: data.targetId ?? null,
      details: data.details ?? null,
      ipAddress: data.ipAddress ?? null,
    });
  } catch (e) {
    logger.error({ err: e }, "Failed to write audit log");
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().slice(0, 10);

  const [totalKeys] = await db.select({ count: sql<number>`count(*)` }).from(licenseKeysTable);
  const [activeKeys] = await db.select({ count: sql<number>`count(*)` }).from(licenseKeysTable).where(eq(licenseKeysTable.status, "active"));
  const [expiringSoon] = await db.select({ count: sql<number>`count(*)` }).from(licenseKeysTable)
    .where(and(eq(licenseKeysTable.status, "active"), lt(licenseKeysTable.expiresAt, in7days)));
  const [expiredKeys] = await db.select({ count: sql<number>`count(*)` }).from(licenseKeysTable).where(eq(licenseKeysTable.status, "expired"));
  const [totalUsers] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
  const [todayUses] = await db.select({ count: sql<number>`count(*)` }).from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, new Date(todayStr)));

  // Usage for last 7 days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const usageChart = await db
    .select({
      date: sql<string>`DATE(${usageLogsTable.createdAt})`,
      count: sql<number>`count(*)`,
    })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, sevenDaysAgo))
    .groupBy(sql`DATE(${usageLogsTable.createdAt})`)
    .orderBy(sql`DATE(${usageLogsTable.createdAt})`);

  return {
    totalKeys: Number(totalKeys.count),
    activeKeys: Number(activeKeys.count),
    expiringSoon: Number(expiringSoon.count),
    expiredKeys: Number(expiredKeys.count),
    totalUsers: Number(totalUsers.count),
    todayUses: Number(todayUses.count),
    usageChart,
  };
}
