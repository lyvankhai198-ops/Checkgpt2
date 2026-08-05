/**
 * Admin routes — requires adminAuthMiddleware for all except /login.
 * Handles key CRUD, users, logs, stats, settings.
 */

import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { eq, desc, and, ilike, sql, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  adminsTable, licenseKeysTable, usersTable,
  usageLogsTable, auditLogsTable, settingsTable, ordersTable,
  type InsertSettings,
} from "@workspace/db";
import { adminAuthMiddleware, signAdminToken } from "../middlewares/adminAuth.js";
import {
  createKeys, revokeKey, lockKey, unlockKey, extendKey,
  setKeyExpiry, logAudit, getDashboardStats, resetUserTrial,
} from "../lib/keyService.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ─── Rate limiting ────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Login ────────────────────────────────────────────────────────────────────

router.post("/admin/login", loginLimiter, async (req, res): Promise<void> => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }

  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.username, username)).limit(1);
  if (!admin) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  await db.update(adminsTable).set({ lastLoginAt: new Date() }).where(eq(adminsTable.id, admin.id));
  await logAudit({ adminId: admin.id, action: "admin_login", ipAddress: req.ip });

  const token = signAdminToken({ adminId: admin.id, username: admin.username });

  res
    .cookie("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24h
    })
    .json({ ok: true, username: admin.username });
});

router.post("/admin/logout", adminAuthMiddleware, (req, res): void => {
  res.clearCookie("admin_token").json({ ok: true });
});

router.get("/admin/me", adminAuthMiddleware, (req, res): void => {
  res.json({ admin: req.admin });
});

// ─── Dashboard stats ──────────────────────────────────────────────────────────

router.get("/admin/stats", adminAuthMiddleware, async (_req, res): Promise<void> => {
  const stats = await getDashboardStats();
  res.json(stats);
});

// ─── Keys ─────────────────────────────────────────────────────────────────────

router.get("/admin/keys", adminAuthMiddleware, async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const conditions = [];
  if (status) conditions.push(eq(licenseKeysTable.status, status as LicenseKey["status"]));
  if (search) conditions.push(ilike(licenseKeysTable.keyDisplay, `%${search}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [keys, [{ count }]] = await Promise.all([
    db.select().from(licenseKeysTable)
      .where(whereClause)
      .orderBy(desc(licenseKeysTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(licenseKeysTable).where(whereClause),
  ]);

  res.json({ keys, total: Number(count), page, limit });
});

type LicenseKey = typeof licenseKeysTable.$inferSelect;

router.post("/admin/keys", adminAuthMiddleware, async (req, res): Promise<void> => {
  const {
    count = 1,
    durationMinutes, expiresAt: expiresAtRaw, neverExpires,
    maxTotalUses, dailyLimit, maxConcurrent, allowedTelegramId,
    maxDevices, lockToTelegram, note, plan,
  } = req.body ?? {};

  const opts = {
    count: Math.min(100, Math.max(1, Number(count) || 1)),
    durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
    expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : undefined,
    neverExpires: Boolean(neverExpires),
    maxTotalUses: maxTotalUses ? Number(maxTotalUses) : undefined,
    dailyLimit: dailyLimit ? Number(dailyLimit) : undefined,
    maxConcurrent: maxConcurrent ? Number(maxConcurrent) : 1,
    allowedTelegramId: allowedTelegramId || undefined,
    maxDevices: maxDevices ? Number(maxDevices) : 1,
    lockToTelegram: Boolean(lockToTelegram),
    note: note || undefined,
    plan: ["basic", "pro"].includes(plan) ? plan as "basic" | "pro" : undefined,
  };

  const created = await createKeys(opts);

  await logAudit({
    adminId: req.admin!.adminId,
    action: "create_keys",
    targetType: "key",
    details: { count: created.length, note: opts.note },
    ipAddress: req.ip,
  });

  res.status(201).json({ keys: created });
});

router.get("/admin/keys/:id", adminAuthMiddleware, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [key] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, id)).limit(1);
  if (!key) { res.status(404).json({ error: "Key not found" }); return; }
  res.json({ key });
});

router.patch("/admin/keys/:id", adminAuthMiddleware, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { action, extraMinutes, expiresAt: expiresAtRaw, note } = req.body ?? {};

  const [existing] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Key not found" }); return; }

  try {
    if (action === "revoke") {
      await revokeKey(id);
    } else if (action === "lock") {
      await lockKey(id);
    } else if (action === "unlock") {
      await unlockKey(id);
    } else if (action === "extend" && extraMinutes) {
      await extendKey(id, Number(extraMinutes));
    } else if (action === "set_expiry" && expiresAtRaw) {
      await setKeyExpiry(id, new Date(expiresAtRaw));
    } else if (note !== undefined) {
      await db.update(licenseKeysTable).set({ note, updatedAt: new Date() }).where(eq(licenseKeysTable.id, id));
    } else {
      res.status(400).json({ error: "Unknown action" }); return;
    }

    await logAudit({
      adminId: req.admin!.adminId,
      action: action ?? "update_key",
      targetType: "key",
      targetId: String(id),
      details: req.body,
      ipAddress: req.ip,
    });

    const [updated] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, id)).limit(1);
    res.json({ key: updated });
  } catch (e) {
    logger.error({ err: e }, "Error patching key");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/keys/:id", adminAuthMiddleware, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await revokeKey(id);
  await logAudit({
    adminId: req.admin!.adminId,
    action: "revoke_key",
    targetType: "key",
    targetId: String(id),
    ipAddress: req.ip,
  });
  res.json({ ok: true });
});

// CSV export
router.get("/admin/keys/export/csv", adminAuthMiddleware, async (_req, res): Promise<void> => {
  const keys = await db.select().from(licenseKeysTable).orderBy(desc(licenseKeysTable.createdAt));
  const header = "id,key_display,status,expires_at,max_total_uses,total_uses,daily_limit,daily_uses,max_concurrent,note,created_at\n";
  const rows = keys.map(k =>
    [k.id, k.keyDisplay, k.status, k.expiresAt?.toISOString() ?? "", k.maxTotalUses ?? "", k.totalUses,
      k.dailyLimit ?? "", k.dailyUses, k.maxConcurrent, `"${(k.note ?? "").replace(/"/g, '""')}"`, k.createdAt.toISOString()].join(",")
  ).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=keys.csv");
  res.send(header + rows);
});

// ─── Users ────────────────────────────────────────────────────────────────────

// ── Inventory ────────────────────────────────────────────────────────────────

router.get("/admin/inventory", adminAuthMiddleware, async (_req, res): Promise<void> => {
  const plans = ["basic", "pro"] as const;
  const result: Record<string, { total: number; available: number; sold: number; revoked: number }> = {};

  for (const plan of plans) {
    const [rows] = await Promise.all([
      db.select({
        status: licenseKeysTable.status,
        count: sql<number>`count(*)`,
      })
        .from(licenseKeysTable)
        .where(eq(licenseKeysTable.plan, plan))
        .groupBy(licenseKeysTable.status),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = Number(row.count);

    result[plan] = {
      total: Object.values(byStatus).reduce((s, v) => s + v, 0),
      available: (byStatus["inactive"] ?? 0),  // inactive = created but not yet activated
      sold: (byStatus["active"] ?? 0) + (byStatus["expired"] ?? 0),
      revoked: byStatus["revoked"] ?? 0,
    };
  }

  res.json({ basic: result.basic ?? { total: 0, available: 0, sold: 0, revoked: 0 }, pro: result.pro ?? { total: 0, available: 0, sold: 0, revoked: 0 } });
});

router.post("/admin/users/:telegramId/reset-trial", adminAuthMiddleware, async (req, res): Promise<void> => {
  const { telegramId } = req.params;
  await resetUserTrial(telegramId);
  await logAudit({
    adminId: req.admin!.adminId,
    action: "reset_trial",
    targetType: "user",
    targetId: telegramId,
    ipAddress: req.ip,
  });
  res.json({ ok: true });
});

router.get("/admin/users", adminAuthMiddleware, async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const [users, [{ count }]] = await Promise.all([
    db.select().from(usersTable).orderBy(desc(usersTable.lastUsedAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(usersTable),
  ]);
  res.json({ users, total: Number(count), page, limit });
});

// ─── Logs ─────────────────────────────────────────────────────────────────────

router.get("/admin/logs/usage", adminAuthMiddleware, async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const telegramId = req.query.telegram_id as string | undefined;
  const since = req.query.since as string | undefined;

  const conditions = [];
  if (telegramId) conditions.push(eq(usageLogsTable.telegramId, telegramId));
  if (since) conditions.push(gte(usageLogsTable.createdAt, new Date(since)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [logs, [{ count }]] = await Promise.all([
    db.select().from(usageLogsTable).where(whereClause).orderBy(desc(usageLogsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(usageLogsTable).where(whereClause),
  ]);
  res.json({ logs, total: Number(count), page, limit });
});

router.get("/admin/logs/audit", adminAuthMiddleware, async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const [logs, [{ count }]] = await Promise.all([
    db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(auditLogsTable),
  ]);
  res.json({ logs, total: Number(count), page, limit });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get("/admin/settings", adminAuthMiddleware, async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);
  if (!settings) {
    res.json({ settings: null });
    return;
  }
  // Never leak secrets in full
  const safe = {
    ...settings,
    telegramBotToken: settings.telegramBotToken ? "***set***" : null,
    sepayApiKey: settings.sepayApiKey ? "***set***" : null,
  };
  res.json({ settings: safe });
});

router.put("/admin/settings", adminAuthMiddleware, async (req, res): Promise<void> => {
  const {
    telegramBotToken, timezone, defaultDurationMinutes, defaultMaxUses,
    defaultDailyLimit, defaultMaxConcurrent, notifyExpiryDays, welcomeMessage,
    basicPrice, proPrice, basicStockTarget, proStockTarget,
  } = req.body ?? {};

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (telegramBotToken && telegramBotToken !== "***set***") updates.telegramBotToken = telegramBotToken;
  if (timezone) updates.timezone = timezone;
  if (defaultDurationMinutes !== undefined) updates.defaultDurationMinutes = Number(defaultDurationMinutes);
  if (defaultMaxUses !== undefined) updates.defaultMaxUses = defaultMaxUses ? Number(defaultMaxUses) : null;
  if (defaultDailyLimit !== undefined) updates.defaultDailyLimit = defaultDailyLimit ? Number(defaultDailyLimit) : null;
  if (defaultMaxConcurrent !== undefined) updates.defaultMaxConcurrent = Number(defaultMaxConcurrent);
  if (notifyExpiryDays !== undefined) updates.notifyExpiryDays = Number(notifyExpiryDays);
  if (welcomeMessage !== undefined) updates.welcomeMessage = welcomeMessage;
  if (basicPrice !== undefined) updates.basicPrice = Number(basicPrice);
  if (proPrice !== undefined) updates.proPrice = Number(proPrice);
  if (basicStockTarget !== undefined) updates.basicStockTarget = Number(basicStockTarget);
  if (proStockTarget !== undefined) updates.proStockTarget = Number(proStockTarget);

  const {
    bankName, bankBin, bankAccount, bankHolder, paymentEnabled,
  } = req.body ?? {};
  if (bankName !== undefined) updates.bankName = bankName;
  if (bankBin !== undefined) updates.bankBin = bankBin;
  if (bankAccount !== undefined) updates.bankAccount = bankAccount;
  if (bankHolder !== undefined) updates.bankHolder = bankHolder;
  if (paymentEnabled !== undefined) updates.paymentEnabled = paymentEnabled ? 1 : 0;

  const { sepayApiKey } = req.body ?? {};
  if (sepayApiKey && sepayApiKey !== "***set***") updates.sepayApiKey = sepayApiKey;

  const upsertValues: InsertSettings = { id: 1, updatedAt: new Date() };
  Object.assign(upsertValues, updates);
  await db
    .insert(settingsTable)
    .values(upsertValues)
    .onConflictDoUpdate({ target: settingsTable.id, set: updates as Partial<InsertSettings> });

  await logAudit({
    adminId: req.admin!.adminId,
    action: "update_settings",
    targetType: "settings",
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

// ── Public prices endpoint (no auth — bot reads this) ────────────────────────
router.get("/prices", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);

  const basicPrice = settings?.basicPrice ?? 20000;
  const proPrice = settings?.proPrice ?? 99000;
  const fmt = (v: number) => v.toLocaleString("vi-VN") + "đ";

  res.json({
    basicPrice,
    proPrice,
    basicPriceFormatted: fmt(basicPrice),
    proPriceFormatted: fmt(proPrice),
    basicStockTarget: settings?.basicStockTarget ?? 50,
    proStockTarget: settings?.proStockTarget ?? 20,
    paymentEnabled: (settings?.paymentEnabled ?? 0) === 1,
    bank: {
      name: settings?.bankName ?? "MB Bank",
      bin: settings?.bankBin ?? "MB",
      account: settings?.bankAccount ?? "",
      holder: settings?.bankHolder ?? "",
    },
  });
});

// ── Admin orders list ─────────────────────────────────────────────────────────
router.get("/admin/orders", adminAuthMiddleware, async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query["page"] ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"] ?? 20)));
  const status = req.query["status"] as string | undefined;
  const offset = (page - 1) * limit;

  const whereClause = status && status !== "all"
    ? eq(ordersTable.status, status as "pending" | "paid" | "delivered" | "failed" | "expired")
    : undefined;

  const [orders, [{ total }]] = await Promise.all([
    db.select().from(ordersTable)
      .where(whereClause)
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(ordersTable).where(whereClause),
  ]);

  res.json({ orders, total: Number(total), page, limit });
});

// ── Auto-stock endpoint ───────────────────────────────────────────────────────
router.post("/admin/inventory/auto-stock", adminAuthMiddleware, async (req, res): Promise<void> => {
  const { plan } = req.body ?? {};
  if (!["basic", "pro"].includes(plan)) {
    res.status(400).json({ error: "plan must be basic or pro" });
    return;
  }

  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);
  const target = plan === "basic"
    ? (settings?.basicStockTarget ?? 50)
    : (settings?.proStockTarget ?? 20);

  // Count current available keys for this plan (inactive = unactivated)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(licenseKeysTable)
    .where(and(eq(licenseKeysTable.plan, plan as "basic" | "pro"), eq(licenseKeysTable.status, "inactive")));

  const available = Number(count);
  const needed = Math.max(0, target - available);

  if (needed === 0) {
    res.json({ created: 0, available, target, message: "Kho đã đủ số lượng mục tiêu." });
    return;
  }

  const planPresets = {
    basic: { durationMinutes: undefined, neverExpires: true, maxTotalUses: 20, maxConcurrent: 1, note: "Gói Basic" },
    pro:   { durationMinutes: undefined, neverExpires: true, maxTotalUses: 30, maxConcurrent: 10, note: "Gói Pro" },
  } as const;

  const preset = planPresets[plan as "basic" | "pro"];
  const created = await createKeys({ ...preset, plan: plan as "basic" | "pro", count: needed });

  await logAudit({
    adminId: req.admin!.adminId,
    action: "auto_stock",
    targetType: "key",
    details: { plan, created: created.length, target },
    ipAddress: req.ip,
  });

  res.json({
    created: created.length,
    available,
    target,
    newAvailable: available + created.length,
    keys: created.map(k => ({ id: k.id, key: k.rawKey, display: k.keyDisplay })),
  });
});

export default router;
