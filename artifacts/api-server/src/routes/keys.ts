/**
 * Key consumer routes — used by Telegram Bot to activate/validate/use keys.
 */

import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import {
  validateKey, validateKeyById, activateKey, recordUse, releaseUse,
  getOrCreateUser, hasTrialLeft, incrementTrial, FREE_TRIAL_LIMIT,
  logUsage,
} from "../lib/keyService.js";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

// Rate limit per telegramId (từ query hoặc body) thay vì IP
// — tránh tình huống tất cả user dùng chung bucket 127.0.0.1
const keyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30,
  message: { error: "Too many requests" },
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => {
    const tid =
      (req.query.telegram_id as string) ||
      (req.body?.telegramId as string) ||
      req.ip ||
      "unknown";
    return String(tid);
  },
});

// ─── Validate ─────────────────────────────────────────────────────────────────

router.get("/keys/validate", keyLimiter, async (req, res): Promise<void> => {
  const rawKey = req.query.key as string;
  const telegramId = req.query.telegram_id as string | undefined;
  if (!rawKey) { res.status(400).json({ error: "key query param required" }); return; }

  const result = await validateKey(rawKey, { telegramId, checkConcurrency: false });
  const k = result.key;
  res.json({
    valid: result.valid,
    reason: result.reason,
    plan: k?.plan ?? "basic",
    expiresAt: k?.expiresAt,
    maxConcurrent: k?.maxConcurrent ?? 1,
    // Usage counters — raw values so bot can render "X/Y"
    totalUses: k?.totalUses ?? 0,
    maxTotalUses: k?.maxTotalUses ?? null,
    dailyUses: k?.dailyUses ?? 0,
    dailyLimit: k?.dailyLimit ?? null,
    // Convenience "left" fields
    dailyUsesLeft: k?.dailyLimit != null ? Math.max(0, k.dailyLimit - k.dailyUses) : null,
    totalUsesLeft: k?.maxTotalUses != null ? Math.max(0, k.maxTotalUses - k.totalUses) : null,
    retryAfter: result.retryAfter,
  });
});

// ─── Activate ─────────────────────────────────────────────────────────────────

router.post("/keys/activate", keyLimiter, async (req, res): Promise<void> => {
  const { key: rawKey, telegramId, deviceInfo, username, firstName } = req.body ?? {};
  if (!rawKey || !telegramId) {
    res.status(400).json({ error: "key and telegramId required" });
    return;
  }

  const user = await getOrCreateUser(String(telegramId), { username, firstName });

  const result = await activateKey(String(rawKey), String(telegramId), {
    deviceInfo,
    ipAddress: req.ip,
    userId: user.id,
  });

  if (!result.success) {
    await logUsage({
      telegramId: String(telegramId),
      action: "activate_fail",
      result: result.reason,
      ipAddress: req.ip,
    });
    res.status(400).json({ success: false, reason: result.reason });
    return;
  }

  res.json({
    success: true,
    expiresAt: result.key?.expiresAt,
    maxConcurrent: result.key?.maxConcurrent,
    dailyLimit: result.key?.dailyLimit,
    maxTotalUses: result.key?.maxTotalUses,
  });
});

// ─── Use / Release ────────────────────────────────────────────────────────────

router.post("/keys/use", keyLimiter, async (req, res): Promise<void> => {
  const { key: rawKey, telegramId } = req.body ?? {};
  if (!rawKey) { res.status(400).json({ error: "key required" }); return; }

  const validateResult = await validateKey(String(rawKey), {
    telegramId: telegramId ? String(telegramId) : undefined,
    checkConcurrency: true,
  });

  if (!validateResult.valid || !validateResult.key) {
    res.status(403).json({ allowed: false, reason: validateResult.reason, retryAfter: validateResult.retryAfter });
    return;
  }

  await recordUse(validateResult.key.id, telegramId ? String(telegramId) : undefined, req.ip);
  res.json({ allowed: true, keyId: validateResult.key.id });
});

router.post("/keys/release", async (req, res): Promise<void> => {
  const { keyId } = req.body ?? {};
  if (!keyId) { res.status(400).json({ error: "keyId required" }); return; }
  await releaseUse(Number(keyId));
  res.json({ ok: true });
});

// ─── Session restore: get user's current key by telegramId ────────────────────
// Used by bot after restart to recover in-memory session from DB

router.get("/keys/user-current", keyLimiter, async (req, res): Promise<void> => {
  const telegramId = req.query.telegramId as string;
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const [user] = await db.select({ currentKeyId: usersTable.currentKeyId })
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);

  if (!user?.currentKeyId) { res.json({ hasKey: false }); return; }

  const result = await validateKeyById(user.currentKeyId, { telegramId });
  const k = result.key;

  res.json({
    hasKey: result.valid,
    keyId: k?.id,
    keyDisplay: k?.keyDisplay,
    plan: k?.plan ?? "basic",
    valid: result.valid,
    reason: result.reason,
    expiresAt: k?.expiresAt,
    maxConcurrent: k?.maxConcurrent ?? 1,
    totalUses: k?.totalUses ?? 0,
    maxTotalUses: k?.maxTotalUses ?? null,
    dailyUses: k?.dailyUses ?? 0,
    dailyLimit: k?.dailyLimit ?? null,
    dailyUsesLeft: k?.dailyLimit != null ? Math.max(0, k.dailyLimit - k.dailyUses) : null,
    totalUsesLeft: k?.maxTotalUses != null ? Math.max(0, k.maxTotalUses - k.totalUses) : null,
  });
});

// ─── Use key by ID (for bot session-restore path, no raw key needed) ──────────

router.post("/keys/use-by-keyid", keyLimiter, async (req, res): Promise<void> => {
  const { keyId, telegramId } = req.body ?? {};
  if (!keyId) { res.status(400).json({ error: "keyId required" }); return; }

  const validateResult = await validateKeyById(Number(keyId), {
    telegramId: telegramId ? String(telegramId) : undefined,
    checkConcurrency: true,
  });

  if (!validateResult.valid || !validateResult.key) {
    res.status(403).json({ allowed: false, reason: validateResult.reason, retryAfter: validateResult.retryAfter });
    return;
  }

  await recordUse(validateResult.key.id, telegramId ? String(telegramId) : undefined, req.ip);
  res.json({ allowed: true, keyId: validateResult.key.id });
});

// ─── Trial ────────────────────────────────────────────────────────────────────

router.post("/keys/trial/check", keyLimiter, async (req, res): Promise<void> => {
  const { telegramId, username, firstName } = req.body ?? {};
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const user = await getOrCreateUser(String(telegramId), { username, firstName });
  const remaining = Math.max(0, FREE_TRIAL_LIMIT - user.trialCount);
  res.json({
    hasTrialLeft: remaining > 0,
    remaining,
    total: FREE_TRIAL_LIMIT,
  });
});

router.post("/keys/trial/use", keyLimiter, async (req, res): Promise<void> => {
  const { telegramId } = req.body ?? {};
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const hasLeft = await hasTrialLeft(String(telegramId));
  if (!hasLeft) {
    res.status(403).json({ allowed: false, reason: "trial_exhausted" });
    return;
  }

  const newCount = await incrementTrial(String(telegramId));
  await logUsage({ telegramId: String(telegramId), action: "trial_use", result: "allowed", ipAddress: req.ip });

  res.json({ allowed: true, usedCount: newCount, remaining: Math.max(0, FREE_TRIAL_LIMIT - newCount) });
});

export default router;
