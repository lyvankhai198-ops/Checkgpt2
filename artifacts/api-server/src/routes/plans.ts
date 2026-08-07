/**
 * Plans routes — public + admin.
 * GET  /api/plans            → public: enabled plans (for bot buy flow)
 * GET  /api/admin/plans      → admin: all plans
 * PUT  /api/admin/plans/:slug → admin: update a plan
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { plansTable } from "@workspace/db";
import { adminAuthMiddleware } from "../middlewares/adminAuth.js";

const router: IRouter = Router();

// ─── Default seed data ────────────────────────────────────────────────────────

const DEFAULT_PLANS = [
  {
    slug: "basic",
    name: "Basic",
    emoji: "🟢",
    color: "#22c55e",
    enabled: true,
    price: 20000,
    description:
      "⏱ Thời hạn: <b>1 ngày</b> kể từ lúc kích hoạt\n" +
      "🔢 Tổng lượt: <b>20 lượt</b>\n" +
      "📌 Mỗi lần check 1 tài khoản trừ 1 lượt\n" +
      "🚫 Tối đa <b>1 tài khoản</b> mỗi lần\n" +
      "🚫 Không hỗ trợ check hàng loạt\n" +
      "🔒 Key tự khoá khi hết 1 ngày <i>hoặc</i> hết 20 lượt\n\n" +
      "<i>💡 Thời hạn chỉ bắt đầu tính từ lúc kích hoạt lần đầu.</i>",
    durationDays: 1,
    maxTotalUses: 20,
    dailyLimit: null,
    maxConcurrent: 1,
    bulkEnabled: false,
    maxBulkLines: 1,
  },
  {
    slug: "pro",
    name: "Pro",
    emoji: "🟣",
    color: "#a855f7",
    enabled: true,
    price: 99000,
    description:
      "⏱ Thời hạn: <b>30 ngày</b> kể từ lúc kích hoạt\n" +
      "🔢 Tổng lượt: <b>30 lần gửi</b>\n" +
      "📌 Mỗi lần gửi 1–10 tài khoản chỉ trừ <b>1 lượt</b>\n" +
      "✅ Tối đa <b>10 tài khoản</b> mỗi lần\n" +
      "✅ Hỗ trợ check hàng loạt\n" +
      "🔒 Key tự khoá khi hết 30 ngày <i>hoặc</i> hết 30 lần gửi\n\n" +
      "<i>💡 Thời hạn chỉ bắt đầu tính từ lúc kích hoạt lần đầu.</i>",
    durationDays: 30,
    maxTotalUses: 30,
    dailyLimit: null,
    maxConcurrent: 10,
    bulkEnabled: true,
    maxBulkLines: 10,
  },
];

async function ensurePlansSeeded() {
  const existing = await db.select({ slug: plansTable.slug }).from(plansTable);
  if (existing.length > 0) return;
  await db.insert(plansTable).values(DEFAULT_PLANS);
}

// ─── Public: enabled plans (for bot) ─────────────────────────────────────────

router.get("/plans", async (_req, res): Promise<void> => {
  await ensurePlansSeeded();
  // Chỉ trả plans đang bật — bot không cần biết plans đã tắt
  const plans = await db.select().from(plansTable).where(eq(plansTable.enabled, true));
  res.json(plans);
});

// ─── Admin: all plans ─────────────────────────────────────────────────────────

router.get("/admin/plans", adminAuthMiddleware, async (_req, res): Promise<void> => {
  await ensurePlansSeeded();
  const plans = await db.select().from(plansTable);
  res.json(plans);
});

// ─── Admin: update plan ───────────────────────────────────────────────────────

router.put("/admin/plans/:slug", adminAuthMiddleware, async (req, res): Promise<void> => {
  const { slug } = req.params;
  const {
    name, emoji, color, enabled, price, description,
    durationDays, maxTotalUses, dailyLimit, maxConcurrent, bulkEnabled, maxBulkLines,
  } = req.body ?? {};

  const existing = await db.select({ id: plansTable.id })
    .from(plansTable)
    .where(eq(plansTable.slug, slug))
    .limit(1);

  if (!existing[0]) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const [updated] = await db
    .update(plansTable)
    .set({
      ...(name !== undefined && { name }),
      ...(emoji !== undefined && { emoji }),
      ...(color !== undefined && { color: color || null }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
      ...(price !== undefined && { price: Number(price) }),
      ...(description !== undefined && { description }),
      ...(durationDays !== undefined && { durationDays: durationDays === null ? null : Number(durationDays) }),
      ...(maxTotalUses !== undefined && { maxTotalUses: maxTotalUses === null ? null : Number(maxTotalUses) }),
      ...(dailyLimit !== undefined && { dailyLimit: dailyLimit === null ? null : Number(dailyLimit) }),
      ...(maxConcurrent !== undefined && { maxConcurrent: Number(maxConcurrent) }),
      ...(bulkEnabled !== undefined && { bulkEnabled: Boolean(bulkEnabled) }),
      ...(maxBulkLines !== undefined && { maxBulkLines: Number(maxBulkLines) }),
      updatedAt: new Date(),
    })
    .where(eq(plansTable.slug, slug))
    .returning();

  res.json(updated);
});

// ─── Admin: create new plan ───────────────────────────────────────────────────

router.post("/admin/plans", adminAuthMiddleware, async (req, res): Promise<void> => {
  const {
    slug, name, emoji, color, enabled, price, description,
    durationDays, maxTotalUses, dailyLimit, maxConcurrent, bulkEnabled, maxBulkLines,
  } = req.body ?? {};

  if (!slug || !name || price === undefined) {
    res.status(400).json({ error: "slug, name, price are required" });
    return;
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ error: "slug must be lowercase alphanumeric and hyphens only" });
    return;
  }

  const existing = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.slug, slug)).limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "Slug already exists" });
    return;
  }

  const [created] = await db.insert(plansTable).values({
    slug,
    name,
    emoji: emoji || "🟡",
    color: color || null,
    enabled: enabled !== false,
    price: Number(price),
    description: description || "",
    durationDays: durationDays ? Number(durationDays) : null,
    maxTotalUses: maxTotalUses ? Number(maxTotalUses) : null,
    dailyLimit: dailyLimit ? Number(dailyLimit) : null,
    maxConcurrent: Number(maxConcurrent ?? 1),
    bulkEnabled: Boolean(bulkEnabled),
    maxBulkLines: Number(maxBulkLines ?? 10),
  }).returning();

  res.status(201).json(created);
});

// ─── Admin: delete plan ───────────────────────────────────────────────────────

router.delete("/admin/plans/:slug", adminAuthMiddleware, async (req, res): Promise<void> => {
  const { slug } = req.params;
  const existing = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.slug, slug)).limit(1);
  if (!existing[0]) { res.status(404).json({ error: "Plan not found" }); return; }
  await db.delete(plansTable).where(eq(plansTable.slug, slug));
  res.json({ ok: true });
});

export default router;
