import { Telegraf, Markup, type Context } from "telegraf";
import {
  checkTrial, useTrial, validateKey, activateKey,
  useKey, releaseKey, checkSingle, checkBulk,
  type CheckResult,
} from "./api.js";
import {
  RateLimiter, formatResult, formatExpiry, escHtml, parseKey,
  parseCredentials, maskCred, credToLine,
} from "./utils.js";
import { getSession, setSession } from "./store.js";

const TRIAL_LIMIT = 3;
const limiter = new RateLimiter(8, 60_000); // 8 requests/min per user

// ─── Guard helpers ────────────────────────────────────────────────────────────

async function guardRate(ctx: Context): Promise<boolean> {
  const uid = ctx.from?.id;
  if (!uid) return false;
  if (!limiter.allow(uid)) {
    await ctx.reply("⏳ Bạn đang gửi quá nhanh. Vui lòng đợi 1 phút rồi thử lại.");
    return false;
  }
  return true;
}

/** Returns { allowed: true } or sends an error and returns { allowed: false }. */
async function resolveAccess(ctx: Context): Promise<
  | { allowed: false }
  | { allowed: true; mode: "trial" }
  | { allowed: true; mode: "key"; key: string; keyId: number }
> {
  const uid = ctx.from!.id;
  const telegramId = String(uid);
  const session = getSession(uid);

  // User has an active key in this session
  if (session.activeKey) {
    const v = await validateKey(session.activeKey, telegramId);
    if (v.valid) {
      const u = await useKey(session.activeKey, telegramId);
      if (u.allowed && u.keyId) {
        return { allowed: true, mode: "key", key: session.activeKey, keyId: u.keyId };
      }
      if (u.reason === "concurrency_limit") {
        await ctx.reply("⏳ Bạn đang chạy quá số tác vụ đồng thời. Đợi lệnh hiện tại xong rồi thử lại.");
        return { allowed: false };
      }
      if (u.reason === "daily_limit_reached") {
        await ctx.reply("📊 Đã đạt giới hạn lượt sử dụng hôm nay. Thử lại vào ngày mai.");
        return { allowed: false };
      }
      if (u.reason === "max_uses_reached") {
        await ctx.reply("🚫 Key đã dùng hết tổng lượt sử dụng.");
        return { allowed: false };
      }
      // Key may have expired since validation
      setSession(uid, { activeKey: undefined, activeKeyId: undefined });
    } else {
      // Key expired or locked
      setSession(uid, { activeKey: undefined, activeKeyId: undefined });
      const reasons: Record<string, string> = {
        expired: "⌛ Key của bạn đã hết hạn.",
        locked: "🔒 Key của bạn đang bị khóa. Liên hệ admin.",
        revoked: "❌ Key đã bị thu hồi.",
        brute_force_locked: "⛔ Quá nhiều lần thử sai. Thử lại sau 15 phút.",
      };
      await ctx.reply((reasons[v.reason] ?? "❌ Key không hợp lệ.") + "\n\nNhập /activate <key> để kích hoạt key mới.");
      return { allowed: false };
    }
  }

  // No key — try trial
  const trial = await checkTrial(telegramId);
  if (trial.hasTrialLeft) {
    const use = await useTrial(telegramId);
    if (use.allowed) {
      const remaining = use.remaining;
      if (remaining === 0) {
        await ctx.reply(
          `✅ Đây là lần dùng thử cuối cùng (${TRIAL_LIMIT}/${TRIAL_LIMIT}).\n` +
          "Sau lần này bạn cần nhập key để tiếp tục sử dụng."
        );
      }
      return { allowed: true, mode: "trial" };
    }
  }

  // No trial left, no key
  await ctx.reply(
    `⛔ Bạn đã dùng hết ${TRIAL_LIMIT} lần thử miễn phí.\n\n` +
    "Nhập /activate <key> để kích hoạt key.\n" +
    "Hoặc nhấn nút bên dưới để mua key.",
    Markup.inlineKeyboard([
      [Markup.button.callback("🛒 Mua Key", "buy_key")],
    ])
  );
  return { allowed: false };
}

// ─── Detect account mode ──────────────────────────────────────────────────────

function detectMode(line: string): "account" | "session" {
  // JWT or long token → session
  if (line.startsWith("eyJ") || line.length > 100) return "session";
  // Contains | → account
  if (line.includes("|")) return "account";
  return "session";
}

// ─── Bulk progress message helper ────────────────────────────────────────────

async function runBulkCheck(ctx: Context, lines: string[]) {
  const uid = ctx.from!.id;

  const statusMsg = await ctx.reply(
    `⏳ Đang kiểm tra <b>${lines.length}</b> tài khoản...\nTiến độ: 0/${lines.length}`,
    { parse_mode: "HTML" }
  );
  const msgId = statusMsg.message_id;

  const results: CheckResult[] = [];
  let completed = 0;
  let lastEdit = 0;

  const rawText = lines.join("\n");
  const mode = detectMode(lines[0]);

  await checkBulk({
    mode,
    rawText,
    concurrency: 2,
    onResult: async (r) => {
      results.push(r);
      completed++;
      // Throttle edits to avoid Telegram flood limits (1 edit per 3s)
      const now = Date.now();
      if (now - lastEdit > 3000) {
        lastEdit = now;
        const live = results.filter(x => x.status === "live").length;
        const die = results.filter(x => x.status === "die").length;
        try {
          await ctx.telegram.editMessageText(
            ctx.chat!.id, msgId, undefined,
            `⏳ Kiểm tra: ${completed}/${lines.length}\n✅ Live: ${live} | ❌ Die: ${die}`,
            { parse_mode: "HTML" }
          );
        } catch { /* ignore edit errors */ }
      }
    },
    onDone: async (total) => {
      const live = results.filter(x => x.status === "live").length;
      const die = results.filter(x => x.status === "die").length;
      const deact = results.filter(x => x.status === "deactivated").length;
      const locked = results.filter(x => x.status === "locked").length;
      const err = results.filter(x => x.status === "error").length;

      try {
        await ctx.telegram.editMessageText(
          ctx.chat!.id, msgId, undefined,
          `✅ <b>Hoàn thành!</b> ${total} tài khoản\n\n` +
          `✅ Live: <b>${live}</b>\n❌ Die: <b>${die}</b>\n⚠️ Deact: ${deact}\n🔒 Locked: ${locked}\n❓ Error: ${err}`,
          { parse_mode: "HTML" }
        );
      } catch { /* ignore */ }

      // Send live accounts as a text file if any
      if (live > 0) {
        const liveLines = results
          .filter(x => x.status === "live")
          .map(x => `${x.email ?? x.input}|${x.plan ?? "Free"}`)
          .join("\n");
        await ctx.replyWithDocument(
          { source: Buffer.from(liveLines, "utf-8"), filename: "live_accounts.txt" },
          { caption: `✅ ${live} tài khoản Live` }
        );
      }
    },
    onError: async (err) => {
      await ctx.reply(`❌ Lỗi khi kiểm tra: ${err.message}`);
    },
  });
}

// ─── Shared credential-input handler (used by /check + plain-text) ───────────

async function handleCredentialInput(ctx: Context, raw: string) {
  const { valid, errors } = parseCredentials(raw);

  // Nothing recognised at all — stay silent (might be unrelated text)
  if (valid.length === 0 && errors.length === 0) return;

  // Build preview
  const preview: string[] = [];
  if (valid.length > 0) {
    preview.push(`📋 <b>Nhận diện được ${valid.length} tài khoản:</b>`);
    valid.forEach((c, i) => preview.push(`  ${i + 1}. ${maskCred(c)}`));
  }
  if (errors.length > 0) {
    if (preview.length) preview.push("");
    preview.push(`⚠️ <b>${errors.length} dòng lỗi (bỏ qua):</b>`);
    errors.forEach(e => preview.push(`  • ${e}`));
  }

  if (valid.length === 0) {
    await ctx.replyWithHTML(preview.join("\n"));
    return;
  }

  await ctx.replyWithHTML(preview.join("\n"));

  // Gate access
  const access = await resolveAccess(ctx);
  if (!access.allowed) return;

  let keyId: number | undefined;
  if (access.mode === "key") keyId = access.keyId;

  try {
    if (valid.length === 1) {
      const line = credToLine(valid[0]);
      const thinkMsg = await ctx.reply("⏳ Đang kiểm tra...");
      const result = await checkSingle("account", line);
      await ctx.telegram.deleteMessage(ctx.chat.id, thinkMsg.message_id).catch(() => {});
      await ctx.replyWithHTML(formatResult(result));
    } else {
      // Release single-use slot immediately; bulk manages its own concurrency
      if (keyId !== undefined) { await releaseKey(keyId).catch(() => {}); keyId = undefined; }
      await runBulkCheck(ctx, valid.map(credToLine));
    }
  } catch (e) {
    await ctx.reply(`❌ Lỗi: ${(e as Error).message}`);
  } finally {
    if (keyId !== undefined) await releaseKey(keyId).catch(() => {});
  }
}

// ─── Bot setup ────────────────────────────────────────────────────────────────

export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // ── /start ──────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    if (!await guardRate(ctx)) return;
    const name = ctx.from.first_name ?? "bạn";
    const telegramId = String(ctx.from.id);
    const trial = await checkTrial(telegramId);

    await ctx.replyWithHTML(
      `👋 Chào <b>${escHtml(name)}</b>! Tôi là <b>GPT Checker Bot</b>.\n\n` +
      `Tôi giúp bạn kiểm tra tài khoản ChatGPT nhanh chóng.\n\n` +
      (trial.hasTrialLeft
        ? `🎁 Bạn còn <b>${trial.remaining}/${TRIAL_LIMIT}</b> lần dùng thử miễn phí.`
        : `⚠️ Bạn đã hết lần dùng thử. Nhập /activate để kích hoạt key.`
      ),
      Markup.inlineKeyboard([
        [Markup.button.callback("🔍 Check tài khoản", "help_check")],
        [Markup.button.callback("🔑 Kích hoạt Key", "help_activate")],
        [Markup.button.callback("📊 Xem trạng thái Key", "cmd_status")],
        [Markup.button.callback("🛒 Mua Key", "buy_key")],
      ])
    );
  });

  // ── /help ───────────────────────────────────────────────────────────────────
  bot.help(async (ctx) => {
    await ctx.replyWithHTML(
      "<b>📖 Hướng dẫn sử dụng</b>\n\n" +
      "<b>✨ Không cần dùng lệnh — dán thẳng vào chat:</b>\n\n" +
      "🔑 <b>Kích hoạt key:</b>\n" +
      "<code>KGPT-XXXXXX-XXXXXX-XXXXXX</code>\n\n" +
      "🔍 <b>Check tài khoản:</b>\n" +
      "<code>email|password</code>\n" +
      "<code>email|password|TOTP_SECRET</code>\n" +
      "Nhiều tài khoản: mỗi dòng 1 tài khoản\n\n" +
      "<b>Lệnh bổ sung:</b>\n" +
      "• /bulk — Upload file .txt check hàng loạt\n" +
      "• /status — Xem trạng thái key\n\n" +
      "<b>Lưu ý:</b> Mỗi người dùng mới được dùng thử miễn phí 3 lần."
    );
  });

  // ── /check ──────────────────────────────────────────────────────────────────
  bot.command("check", async (ctx) => {
    if (!await guardRate(ctx)) return;

    const raw = ctx.message.text.replace(/^\/check\s*/i, "").trim();
    if (!raw) {
      await ctx.replyWithHTML(
        "📝 Dán thẳng tài khoản vào chat không cần lệnh, hoặc dùng:\n" +
        "<code>/check email|password</code>\n" +
        "<code>/check email|password|2fa_secret</code>"
      );
      return;
    }

    await handleCredentialInput(ctx, raw);
  });

  // ── /bulk ───────────────────────────────────────────────────────────────────
  bot.command("bulk", async (ctx) => {
    if (!await guardRate(ctx)) return;

    const uid = ctx.from.id;
    const telegramId = String(uid);
    const session = getSession(uid);

    // Require valid key for bulk
    if (!session.activeKey) {
      const trial = await checkTrial(telegramId);
      if (!trial.hasTrialLeft) {
        await ctx.reply(
          "🔑 Cần có key để dùng tính năng bulk check.\n\nNhập /activate <key> để kích hoạt.",
          Markup.inlineKeyboard([[Markup.button.callback("🛒 Mua Key", "buy_key")]])
        );
        return;
      }
    }

    setSession(uid, { waitingBulk: true });
    await ctx.replyWithHTML(
      "📤 <b>Gửi file .txt chứa danh sách tài khoản.</b>\n\n" +
      "Mỗi dòng 1 tài khoản, định dạng:\n" +
      "<code>email|password</code>\n" +
      "<code>email|password|2fa_secret</code>\n\n" +
      "Tối đa <b>500</b> dòng mỗi lần."
    );
  });

  // Handle file upload for bulk
  bot.on("document", async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const session = getSession(uid);
    if (!session.waitingBulk) return;
    if (!await guardRate(ctx)) return;

    setSession(uid, { waitingBulk: false });

    const doc = ctx.message.document;
    if (!doc.file_name?.endsWith(".txt") && doc.mime_type !== "text/plain") {
      await ctx.reply("❌ Chỉ hỗ trợ file .txt");
      return;
    }
    if (doc.file_size && doc.file_size > 500_000) {
      await ctx.reply("❌ File quá lớn (tối đa 500KB)");
      return;
    }

    const access = await resolveAccess(ctx);
    if (!access.allowed) return;

    let keyId: number | undefined;
    if (access.mode === "key") keyId = access.keyId;

    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const resp = await fetch(fileLink.href);
      const text = await resp.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 500);

      if (lines.length === 0) {
        await ctx.reply("❌ File trống");
        return;
      }

      // Release the single-use slot from resolveAccess immediately
      // since bulk will manage its own concurrency
      if (keyId !== undefined) await releaseKey(keyId).catch(() => {});

      await runBulkCheck(ctx, lines);
    } catch (e) {
      await ctx.reply(`❌ Không đọc được file: ${(e as Error).message}`);
      if (keyId !== undefined) await releaseKey(keyId).catch(() => {});
    }
  });

  // ── /activate ───────────────────────────────────────────────────────────────
  bot.command("activate", async (ctx) => {
    if (!await guardRate(ctx)) return;

    const rawInput = ctx.message.text.replace(/^\/activate\s*/i, "").trim();
    if (!rawInput) {
      await ctx.replyWithHTML("📝 Cách dùng: <code>/activate KGPT-XXXXXX-XXXXXX-XXXXXX</code>");
      return;
    }

    const key = parseKey(rawInput) ?? rawInput.trim();
    const uid = ctx.from.id;
    const telegramId = String(uid);

    const thinkMsg = await ctx.reply("⏳ Đang kích hoạt key...");
    const result = await activateKey({
      key,
      telegramId,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    });
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkMsg.message_id).catch(() => {});

    if (result.success) {
      setSession(uid, { activeKey: key });
      const lines = [
        "✅ <b>Key kích hoạt thành công!</b>",
        "",
        `🔑 Key: <code>${escHtml(key.slice(0, 8))}***</code>`,
        result.expiresAt
          ? `⌛ Hết hạn: <b>${formatExpiry(result.expiresAt)}</b>`
          : "⌛ Không hết hạn",
        result.dailyLimit !== null && result.dailyLimit !== undefined
          ? `📊 Giới hạn/ngày: <b>${result.dailyLimit}</b>`
          : "📊 Giới hạn/ngày: Không giới hạn",
        result.maxTotalUses !== null && result.maxTotalUses !== undefined
          ? `🔢 Tổng lượt: <b>${result.maxTotalUses}</b>`
          : "🔢 Tổng lượt: Không giới hạn",
        "",
        "Dùng /check để bắt đầu kiểm tra tài khoản.",
      ];
      await ctx.replyWithHTML(lines.join("\n"));
    } else {
      const reasons: Record<string, string> = {
        not_found: "❌ Key không tồn tại hoặc đã nhập sai.",
        revoked: "❌ Key đã bị thu hồi.",
        locked: "🔒 Key đang bị khóa. Liên hệ admin.",
        expired: "⌛ Key đã hết hạn.",
        telegram_mismatch: "⛔ Key này được gán cho người dùng khác.",
        max_uses_reached: "🚫 Key đã dùng hết lượt.",
        brute_force_locked: "⛔ Quá nhiều lần thử sai. Thử lại sau 15 phút.",
      };
      await ctx.replyWithHTML(
        (reasons[result.reason ?? ""] ?? `❌ Kích hoạt thất bại: ${escHtml(result.reason ?? "unknown")}`) +
        "\n\nKiểm tra lại key hoặc liên hệ admin.",
        Markup.inlineKeyboard([[Markup.button.callback("🛒 Mua Key", "buy_key")]])
      );
    }
  });

  // ── /status ─────────────────────────────────────────────────────────────────
  bot.command("status", async (ctx) => {
    if (!await guardRate(ctx)) return;

    const uid = ctx.from.id;
    const telegramId = String(uid);
    const session = getSession(uid);

    if (!session.activeKey) {
      const trial = await checkTrial(telegramId);
      await ctx.replyWithHTML(
        "📊 <b>Trạng thái tài khoản</b>\n\n" +
        `🔑 Key: <i>Chưa kích hoạt</i>\n` +
        `🎁 Lần thử miễn phí: <b>${trial.remaining}/${TRIAL_LIMIT}</b> còn lại`,
        Markup.inlineKeyboard([
          [Markup.button.callback("🛒 Mua Key", "buy_key")],
        ])
      );
      return;
    }

    const v = await validateKey(session.activeKey, telegramId);
    const lines = [
      "📊 <b>Trạng thái Key</b>",
      "",
      `🔑 Key: <code>${escHtml(session.activeKey.slice(0, 8))}***</code>`,
      `🟢 Trạng thái: <b>${v.valid ? "Hợp lệ" : "Không hợp lệ"}</b>`,
    ];
    if (v.valid) {
      lines.push(`⌛ Hết hạn: <b>${formatExpiry(v.expiresAt)}</b>`);
      if (v.dailyUsesLeft !== null && v.dailyUsesLeft !== undefined)
        lines.push(`📊 Còn hôm nay: <b>${v.dailyUsesLeft}</b> lượt`);
      if (v.totalUsesLeft !== null && v.totalUsesLeft !== undefined)
        lines.push(`🔢 Tổng còn lại: <b>${v.totalUsesLeft}</b> lượt`);
    } else {
      lines.push(`❌ Lý do: ${v.reason}`);
      setSession(uid, { activeKey: undefined });
    }
    await ctx.replyWithHTML(lines.join("\n"));
  });

  // ── Inline button callbacks ──────────────────────────────────────────────────

  bot.action("buy_key", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("🛒 Tính năng mua key đang được phát triển. Vui lòng liên hệ admin để được cấp key.");
  });

  bot.action("help_check", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
      "🔍 <b>Cách check tài khoản:</b>\n\n" +
      "Dán thẳng vào chat (không cần lệnh):\n" +
      "<code>email|password</code>\n" +
      "<code>email|password|TOTP_SECRET</code>\n\n" +
      "Nhiều tài khoản cùng lúc — mỗi dòng 1 tài khoản.\n\n" +
      "Hoặc dùng /bulk để upload file .txt check hàng loạt."
    );
  });

  bot.action("help_activate", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
      "🔑 <b>Cách kích hoạt key:</b>\n\n" +
      "Dán thẳng key vào chat (không cần lệnh):\n" +
      "<code>KGPT-XXXXXX-XXXXXX-XXXXXX</code>\n\n" +
      "Hoặc dùng lệnh: <code>/activate KGPT-XXXXXX-XXXXXX-XXXXXX</code>"
    );
  });

  bot.action("cmd_status", async (ctx) => {
    await ctx.answerCbQuery();
    const uid = ctx.from!.id;
    const telegramId = String(uid);
    const session = getSession(uid);
    const trial = await checkTrial(telegramId);

    if (!session.activeKey) {
      await ctx.replyWithHTML(
        `📊 <b>Trạng thái:</b> Chưa có key\n🎁 Dùng thử: <b>${trial.remaining}/${TRIAL_LIMIT}</b> còn lại`
      );
    } else {
      const v = await validateKey(session.activeKey, telegramId);
      await ctx.replyWithHTML(
        `📊 <b>Key:</b> <code>${escHtml(session.activeKey.slice(0, 8))}***</code>\n` +
        `🟢 Hợp lệ: <b>${v.valid}</b>\n⌛ Hết hạn: <b>${formatExpiry(v.expiresAt)}</b>`
      );
    }
  });

  // ── Plain-text message → auto detect key OR credentials ────────────────────
  bot.on("text", async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;

    const raw = ctx.message.text.trim();

    // Ignore commands (handled above)
    if (raw.startsWith("/")) return;

    // Ignore if user is waiting for bulk file upload
    const session = getSession(uid);
    if (session.waitingBulk) return;

    if (!await guardRate(ctx)) return;

    // ── Case 1: looks like a KGPT key → auto activate ──────────────────────
    const key = parseKey(raw);
    if (key) {
      const telegramId = String(uid);
      const thinkMsg = await ctx.reply("⏳ Đang kích hoạt key...");
      const result = await activateKey({
        key,
        telegramId,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
      });
      await ctx.telegram.deleteMessage(ctx.chat.id, thinkMsg.message_id).catch(() => {});

      if (result.success) {
        setSession(uid, { activeKey: key });
        const lines = [
          "✅ <b>Key kích hoạt thành công!</b>",
          "",
          `🔑 Key: <code>${escHtml(key.slice(0, 8))}***</code>`,
          result.expiresAt
            ? `⌛ Hết hạn: <b>${formatExpiry(result.expiresAt)}</b>`
            : "⌛ Không hết hạn",
          result.dailyLimit !== null && result.dailyLimit !== undefined
            ? `📊 Giới hạn/ngày: <b>${result.dailyLimit}</b>`
            : "📊 Giới hạn/ngày: Không giới hạn",
          result.maxTotalUses !== null && result.maxTotalUses !== undefined
            ? `🔢 Tổng lượt: <b>${result.maxTotalUses}</b>`
            : "🔢 Tổng lượt: Không giới hạn",
          "",
          "Dùng /check hoặc dán tài khoản vào chat để bắt đầu kiểm tra.",
        ];
        await ctx.replyWithHTML(lines.join("\n"));
      } else {
        const reasons: Record<string, string> = {
          not_found: "❌ Key không tồn tại hoặc đã nhập sai.",
          revoked: "❌ Key đã bị thu hồi.",
          locked: "🔒 Key đang bị khóa. Liên hệ admin.",
          expired: "⌛ Key đã hết hạn.",
          telegram_mismatch: "⛔ Key này được gán cho người dùng khác.",
          max_uses_reached: "🚫 Key đã dùng hết lượt.",
          brute_force_locked: "⛔ Quá nhiều lần thử sai. Thử lại sau 15 phút.",
        };
        await ctx.replyWithHTML(
          (reasons[result.reason ?? ""] ?? `❌ Kích hoạt thất bại: ${escHtml(result.reason ?? "unknown")}`) +
          "\n\nKiểm tra lại key hoặc liên hệ admin.",
          Markup.inlineKeyboard([[Markup.button.callback("🛒 Mua Key", "buy_key")]])
        );
      }
      return;
    }

    // ── Case 2: looks like credentials (has @) → auto check ────────────────
    if (!raw.includes("@")) return;
    await handleCredentialInput(ctx, raw);
  });

  // ── Global error handler ─────────────────────────────────────────────────────
  bot.catch(async (err, ctx) => {
    console.error("Bot error:", err);
    try {
      await ctx.reply("❌ Đã xảy ra lỗi nội bộ. Vui lòng thử lại sau.");
    } catch { /* ignore */ }
  });

  return bot;
}
