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

/** Delete a Telegram message (best-effort — ignores errors) */
async function deleteTelegramMessage(chatId: string, messageId: number): Promise<void> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token || !messageId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch {
    // non-critical
  }
}

// ─── Create order (called by bot) ────────────────────────────────────────────

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
    status: "pending",
    expiresAt,
  } satisfies InsertOrder).returning();

  res.json({
    orderId: order.id,
    orderCode,
    amount,
    expiresAt,
    bankName,
    bankBin,
    bankAccount,
    bankHolder,
  });
});

// ─── Record QR message ID ─────────────────────────────────────────────────────

router.post("/payment/orders/:id/qr-message", async (req, res): Promise<void> => {
  const orderId = Number(req.params.id);
  const { messageId } = req.body ?? {};
  if (!orderId || !messageId) {
    res.status(400).json({ error: "orderId and messageId required" });
    return;
  }
  await db.update(ordersTable)
    .set({ qrMessageId: Number(messageId) })
    .where(eq(ordersTable.id, orderId));
  res.json({ ok: true });
});

// ─── SePay webhook ───────────────────────────────────────────────────────────
//
// IDEMPOTENCY GUARANTEE:
// We use an atomic conditional UPDATE (WHERE status = 'pending') as the first
// mutating step. Only one concurrent webhook call can transition an order from
// 'pending' → 'paid'. If the UPDATE returns no rows the order was already
// processed and we return early. Key allocation happens inside a DB transaction
// so the same key cannot be assigned twice.

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

  // Look up order first (read-only, no lock needed yet)
  const [existingOrder] = await db.select().from(ordersTable)
    .where(eq(ordersTable.orderCode, orderCode)).limit(1);

  if (!existingOrder) {
    logger.info({ orderCode }, "SePay webhook: order not found");
    res.json({ success: false, error: "order_not_found" });
    return;
  }

  // Fast-path: already processed (no mutation needed)
  if (existingOrder.status !== "pending") {
    logger.info({ orderCode, status: existingOrder.status }, "SePay webhook: order already processed");
    res.json({ success: true, note: "already_processed" });
    return;
  }

  // Check if expired
  if (existingOrder.expiresAt && existingOrder.expiresAt < new Date()) {
    // Atomic: only update if still pending (avoids race with concurrent expiry)
    await db.update(ordersTable)
      .set({ status: "expired" })
      .where(and(eq(ordersTable.id, existingOrder.id), eq(ordersTable.status, "pending")));
    await sendTelegram(existingOrder.telegramId,
      `⏰ <b>Đơn hàng ${orderCode} đã hết hạn.</b>\n\nVui lòng tạo đơn mới để tiếp tục.`
    );
    res.json({ success: false, error: "order_expired" });
    return;
  }

  // Check amount (allow ±1000 tolerance for rounding)
  if (Math.abs(Number(transferAmount) - existingOrder.amount) > 1000) {
    logger.warn({ received: transferAmount, expected: existingOrder.amount }, "SePay webhook: amount mismatch");
    await sendTelegram(existingOrder.telegramId,
      `⚠️ <b>Thanh toán không khớp số tiền.</b>\n\n` +
      `Đơn <code>${orderCode}</code> yêu cầu <b>${existingOrder.amount.toLocaleString("vi-VN")}đ</b> ` +
      `nhưng nhận được <b>${Number(transferAmount).toLocaleString("vi-VN")}đ</b>.\n\n` +
      `Liên hệ admin để được hỗ trợ.`
    );
    res.json({ success: false, error: "amount_mismatch" });
    return;
  }

  // ── ATOMIC TRANSITION: pending → paid ──────────────────────────────────────
  // Uses conditional UPDATE so concurrent webhooks cannot both succeed.
  // If this returns 0 rows, another request already handled this order.
  const [paidOrder] = await db.update(ordersTable)
    .set({ status: "paid", paidAt: new Date() })
    .where(and(eq(ordersTable.orderCode, orderCode), eq(ordersTable.status, "pending")))
    .returning();

  if (!paidOrder) {
    // Another concurrent webhook already processed this order
    logger.info({ orderCode }, "SePay webhook: concurrent request already processed order");
    res.json({ success: true, note: "already_processed" });
    return;
  }

  // ── ALLOCATE KEY INSIDE TRANSACTION ────────────────────────────────────────
  // Transaction ensures key status flip and order update are atomic.
  const order = paidOrder;
  const qrMessageId = order.qrMessageId;

  // Get plan display info
  const [planRow] = await db.select({ name: plansTable.name, emoji: plansTable.emoji })
    .from(plansTable)
    .where(eq(plansTable.slug, order.plan))
    .limit(1);
  const planLabel = planRow ? `${planRow.emoji} ${planRow.name}` : order.plan;

  try {
    const deliveredKey = await db.transaction(async (tx) => {
      // Lock and pick an available key (SKIP LOCKED prevents concurrent allocation)
      const [availableKey] = await tx
        .select()
        .from(licenseKeysTable)
        .where(and(
          eq(licenseKeysTable.plan, order.plan),
          eq(licenseKeysTable.status, "inactive"),
        ))
        .limit(1)
        .for("update", { skipLocked: true });

      if (!availableKey) return null;

      // Mark key as active
      await tx.update(licenseKeysTable)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(licenseKeysTable.id, availableKey.id));

      // Mark order delivered
      await tx.update(ordersTable).set({
        status: "delivered",
        keyId: availableKey.id,
        deliveredAt: new Date(),
      }).where(eq(ordersTable.id, order.id));

      return availableKey;
    });

    if (!deliveredKey) {
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

    // Delete QR code message (best-effort)
    if (qrMessageId) {
      await deleteTelegramMessage(order.telegramId, qrMessageId);
    }

    // Deliver key to user via Telegram
    await sendTelegram(order.telegramId,
      `🎉 <b>Thanh toán thành công! Key của bạn đây:</b>\n\n` +
      `<code>${deliveredKey.keyDisplay}</code>\n\n` +
      `Gói: <b>${planLabel}</b>\n` +
      `Để kích hoạt, dán key vào chat hoặc gõ:\n` +
      `<code>/activate ${deliveredKey.keyDisplay}</code>\n\n` +
      `<i>Key chỉ hiển thị một lần — hãy lưu lại!</i>`
    );

    logger.info({ orderCode, keyId: deliveredKey.id, telegramId: order.telegramId }, "Key delivered");
    res.json({ success: true, delivered: true });
  } catch (err) {
    logger.error({ err, orderCode }, "SePay webhook: transaction failed");
    res.status(500).json({ success: false, error: "internal_error" });
  }
});

export default router;
