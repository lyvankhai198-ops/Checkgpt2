/**
 * SePay payment webhook + public payment info endpoint.
 *
 * SePay calls POST /api/payment/webhook with an Authorization header:
 *   Authorization: Apikey <SEPAY_API_KEY>
 * Body contains the transaction including `content` (payment description) and `transferAmount`.
 */

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  ordersTable, licenseKeysTable, settingsTable, plansTable,
  type InsertOrder,
} from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique order code embedded in transfer descriptions */
function generateOrderCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "ORD";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Send a Telegram message directly via Bot API (no Telegraf dependency) */
async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram delivery message");
  }
}

// ─── Create order (called by bot) ────────────────────────────────────────────
// Accepts any plan slug. Price comes from plansTable (single source of truth).
// Payment is considered "enabled" when bank account is configured in settings.

router.post("/payment/orders", async (req, res): Promise<void> => {
  const { telegramId, username, plan } = req.body ?? {};
  if (!telegramId || !plan) {
    res.status(400).json({ error: "telegramId and plan required" });
    return;
  }

  // Get bank settings
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);
  const bankName    = settings?.bankName    ?? "MB Bank";
  const bankBin     = settings?.bankBin     ?? "";
  const bankAccount = settings?.bankAccount ?? "";
  const bankHolder  = settings?.bankHolder  ?? "";

  if (!bankAccount) {
    res.status(503).json({ error: "payment_not_configured" });
    return;
  }

  // Get price from plansTable (admin's single source of truth)
  const [planRow] = await db.select({ price: plansTable.price, enabled: plansTable.enabled })
    .from(plansTable)
    .where(eq(plansTable.slug, String(plan)))
    .limit(1);

  if (!planRow || !planRow.enabled) {
    res.status(404).json({ error: "plan_not_found_or_disabled" });
    return;
  }

  const amount = planRow.price;

  // Cancel any existing pending orders for this user+plan
  await db
    .update(ordersTable)
    .set({ status: "expired" })
    .where(and(
      eq(ordersTable.telegramId, telegramId),
      eq(ordersTable.plan, String(plan)),
      eq(ordersTable.status, "pending"),
    ));

  const orderCode = generateOrderCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  const [order] = await db.insert(ordersTable).values({
    telegramId,
    username: username ?? null,
    plan: String(plan),
    amount,
    orderCode,
    expiresAt,
  } as InsertOrder).returning();

  // VietQR URL
  const fmtAmount = amount.toLocaleString("vi-VN");
  const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-compact.png` +
    `?amount=${amount}&addInfo=${orderCode}&accountName=${encodeURIComponent(bankHolder)}`;

  res.json({
    orderId: order.id,
    orderCode,
    amount,
    amountFormatted: `${fmtAmount}đ`,
    expiresAt: expiresAt.toISOString(),
    bank: { name: bankName, account: bankAccount, holder: bankHolder },
    qrUrl,
  });
});

// ─── SePay webhook ───────────────────────────────────────────────────────────

router.post("/payment/webhook", async (req, res): Promise<void> => {
  // Read API key from settings (falls back to env var)
  const [settingsRow] = await db.select({ sepayApiKey: settingsTable.sepayApiKey })
    .from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);
  const apiKey = settingsRow?.sepayApiKey || process.env["SEPAY_API_KEY"];

  // Verify SePay sends Authorization: Apikey <key>
  const authHeader = req.headers["authorization"] ?? "";
  const expectedAuth = apiKey ? `Apikey ${apiKey}` : null;

  if (expectedAuth && authHeader !== expectedAuth) {
    logger.warn({ authHeader }, "SePay webhook: unauthorized");
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const body = req.body ?? {};
  const { content, transferAmount, accountNumber } = body;

  logger.info({ content, transferAmount, accountNumber }, "SePay webhook received");

  if (!content || !transferAmount) {
    res.json({ success: false, error: "missing fields" });
    return;
  }

  // Find order code in the transfer content (description)
  const match = String(content).match(/ORD[A-Z0-9]{8}/i);
  if (!match) {
    logger.info({ content }, "SePay webhook: no order code found in content");
    res.json({ success: false, error: "no_order_code" });
    return;
  }

  const orderCode = match[0].toUpperCase();
  const [order] = await db.select().from(ordersTable)
    .where(eq(ordersTable.orderCode, orderCode)).limit(1);

  if (!order) {
    logger.info({ orderCode }, "SePay webhook: order not found");
    res.json({ success: false, error: "order_not_found" });
    return;
  }

  if (order.status !== "pending") {
    logger.info({ orderCode, status: order.status }, "SePay webhook: order already processed");
    res.json({ success: true, note: "already_processed" });
    return;
  }

  // Check if expired
  if (order.expiresAt && order.expiresAt < new Date()) {
    await db.update(ordersTable).set({ status: "expired" }).where(eq(ordersTable.id, order.id));
    await sendTelegram(order.telegramId,
      `⏰ <b>Đơn hàng ${orderCode} đã hết hạn.</b>\n\nVui lòng tạo đơn mới để tiếp tục.`
    );
    res.json({ success: false, error: "order_expired" });
    return;
  }

  // Check amount (allow ±1000 tolerance for rounding)
  if (Math.abs(Number(transferAmount) - order.amount) > 1000) {
    logger.warn({ received: transferAmount, expected: order.amount }, "SePay webhook: amount mismatch");
    await sendTelegram(order.telegramId,
      `⚠️ <b>Thanh toán không khớp số tiền.</b>\n\n` +
      `Đơn <code>${orderCode}</code> yêu cầu <b>${order.amount.toLocaleString("vi-VN")}đ</b> ` +
      `nhưng nhận được <b>${Number(transferAmount).toLocaleString("vi-VN")}đ</b>.\n\n` +
      `Liên hệ admin để được hỗ trợ.`
    );
    res.json({ success: false, error: "amount_mismatch" });
    return;
  }

  // Mark order as paid
  await db.update(ordersTable)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(ordersTable.id, order.id));

  // Pick an available key for this plan
  const [availableKey] = await db.select()
    .from(licenseKeysTable)
    .where(and(
      eq(licenseKeysTable.plan, order.plan),
      eq(licenseKeysTable.status, "inactive"),
    ))
    .limit(1);

  // Get plan display info from plansTable
  const [planRow] = await db.select({ name: plansTable.name, emoji: plansTable.emoji })
    .from(plansTable)
    .where(eq(plansTable.slug, order.plan))
    .limit(1);
  const planLabel = planRow ? `${planRow.emoji} ${planRow.name}` : order.plan;

  if (!availableKey) {
    logger.error({ plan: order.plan, orderCode }, "SePay webhook: no available key for plan");
    await sendTelegram(order.telegramId,
      `✅ <b>Thanh toán thành công!</b>\n\n` +
      `⚠️ Hệ thống tạm thời hết key gói ${planLabel}.\n` +
      `Admin sẽ giao key cho bạn sớm nhất. Xin lỗi vì sự bất tiện này.`
    );
    await db.update(ordersTable).set({ status: "failed" }).where(eq(ordersTable.id, order.id));
    res.json({ success: false, error: "no_key_available" });
    return;
  }

  // Assign key and mark order delivered
  await db.update(ordersTable).set({
    status: "delivered",
    keyId: availableKey.id,
    deliveredAt: new Date(),
  }).where(eq(ordersTable.id, order.id));

  // Deliver key to user via Telegram
  await sendTelegram(order.telegramId,
    `🎉 <b>Thanh toán thành công! Key của bạn đây:</b>\n\n` +
    `<code>${availableKey.keyDisplay}</code>\n\n` +
    `Gói: <b>${planLabel}</b>\n` +
    `Để kích hoạt, dán key vào chat hoặc gõ:\n` +
    `<code>/activate ${availableKey.keyDisplay}</code>\n\n` +
    `<i>Key chỉ hiển thị một lần — hãy lưu lại!</i>`
  );

  logger.info({ orderCode, keyId: availableKey.id, telegramId: order.telegramId }, "Key delivered");
  res.json({ success: true, delivered: true });
});

export default router;
