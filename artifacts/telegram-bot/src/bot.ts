import { Telegraf, Markup, type Context } from "telegraf";
import {
  checkTrial, useTrial, validateKey, activateKey,
  useKey, useKeyById, releaseKey, checkSingle, checkBulk, getPrices, createOrder, saveOrderQrMessageId,
  getPlans, fmtPlanPrice, getCurrentUserKey, saveUserLanguage, getUserLanguage,
  type CheckResult, type ValidateResponse, type PlanConfig, type UserCurrentKeyResponse,
} from "./api.js";
import {
  RateLimiter, formatResult, formatExpiry, escHtml, parseKey,
  parseCredentials, maskCred, credToLine,
} from "./utils.js";
import { getSession, setSession } from "./store.js";
import { l, type Lang } from "./i18n.js";

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
  | { allowed: true; mode: "key"; key: string; keyId: number; plan: string; maxConcurrent: number }
> {
  const uid = ctx.from!.id;
  const telegramId = String(uid);
  const session = getSession(uid);

  // ── Path A: raw key in memory (user typed it this session) ───────────────────
  if (session.activeKey) {
    const v = await validateKey(session.activeKey, telegramId);
    if (v.valid) {
      const u = await useKey(session.activeKey, telegramId);
      if (u.allowed && u.keyId) {
        return { allowed: true, mode: "key", key: session.activeKey, keyId: u.keyId, plan: v.plan ?? "basic", maxConcurrent: v.maxConcurrent ?? 1 };
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
      setSession(uid, { activeKey: undefined, activeKeyId: undefined });
    } else {
      setSession(uid, { activeKey: undefined, activeKeyId: undefined });
      const reasons: Record<string, string> = {
        expired: "⌛ Key của bạn đã hết hạn.",
        locked: "🔒 Key của bạn đang bị khóa. Liên hệ admin.",
        revoked: "❌ Key đã bị thu hồi.",
        brute_force_locked: "⛔ Quá nhiều lần thử sai. Thử lại sau 15 phút.",
      };
      await ctx.reply((reasons[v.reason ?? ""] ?? "❌ Key không hợp lệ.") + "\n\nNhập /activate <key> để kích hoạt key mới.");
      return { allowed: false };
    }
  }

  // ── Path B: restore session from DB (after bot restart) ──────────────────────
  // Only run once per user per process lifetime to avoid repeated DB calls.
  if (!session.activeKeyId && !session.dbSessionChecked) {
    setSession(uid, { dbSessionChecked: true }); // mark immediately to avoid double-call
    const current = await getCurrentUserKey(telegramId);
    if (current.hasKey && current.keyId) {
      setSession(uid, { activeKeyId: current.keyId, activeKeyDisplay: current.keyDisplay });
    }
  }

  // ── Path C: key ID in memory (raw activate OR restored from DB) ───────────────
  if (!session.activeKey && session.activeKeyId) {
    const u = await useKeyById(session.activeKeyId, telegramId);
    if (u.allowed && u.keyId) {
      // Get plan/maxConcurrent from DB (one cheap read)
      const cur = await getCurrentUserKey(telegramId);
      return {
        allowed: true, mode: "key",
        key: session.activeKeyDisplay ?? session.activeKey ?? "***",
        keyId: u.keyId,
        plan: cur.plan ?? "basic",
        maxConcurrent: cur.maxConcurrent ?? 1,
      };
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
    // Key became invalid (expired, revoked, locked)
    setSession(uid, { activeKeyId: undefined, activeKeyDisplay: undefined });
    const reasons: Record<string, string> = {
      expired: "⌛ Key của bạn đã hết hạn.",
      locked: "🔒 Key của bạn đang bị khóa. Liên hệ admin.",
      revoked: "❌ Key đã bị thu hồi.",
    };
    await ctx.reply((reasons[u.reason ?? ""] ?? "❌ Key không còn hợp lệ.") + "\n\nNhập /activate <key> để kích hoạt key mới.");
    return { allowed: false };
  }

  // ── Path D: no key at all — try trial ─────────────────────────────────────────
  const trial = await checkTrial(telegramId);
  if (trial.hasTrialLeft) {
    const use = await useTrial(telegramId);
    if (use.allowed) {
      const remaining = use.remaining;
      if (remaining === 0) {
        const lang: Lang = getSession(uid).lang ?? "vi";
        const plans = await getPlans();
        const enabled = plans.filter(p => p.enabled);
        await ctx.replyWithHTML(
          l(lang, "trialLastUse", { limit: String(TRIAL_LIMIT) }),
          enabled.length > 0
            ? Markup.inlineKeyboard(enabled.map(p => [Markup.button.callback(`${p.emoji} ${p.name}  —  ${fmtPlanPrice(p.price)}`, `plan_${p.slug}`)]))
            : undefined
        );
      }
      return { allowed: true, mode: "trial" };
    }
  }

  // No trial left, no key
  const lang2: Lang = getSession(uid).lang ?? "vi";
  await ctx.replyWithHTML(
    l(lang2, "trialExhausted", { limit: String(TRIAL_LIMIT) }),
    Markup.inlineKeyboard([[Markup.button.callback(l(lang2, "buyBtn"), "buy_key")]])
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

      // Send result files
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
      if (die > 0) {
        const dieLines = results
          .filter(x => x.status === "die")
          .map(x => x.email ?? x.input)
          .join("\n");
        await ctx.replyWithDocument(
          { source: Buffer.from(dieLines, "utf-8"), filename: "die_accounts.txt" },
          { caption: `❌ ${die} tài khoản Die` }
        );
      }
      if (deact > 0) {
        const deactLines = results
          .filter(x => x.status === "deactivated")
          .map(x => x.email ?? x.input)
          .join("\n");
        await ctx.replyWithDocument(
          { source: Buffer.from(deactLines, "utf-8"), filename: "deact_accounts.txt" },
          { caption: `⚠️ ${deact} tài khoản Deact` }
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

  // Determine per-submission account limit based on key plan
  // Trial → 1; Basic → 1; Pro → 10
  const isPro = access.mode === "key" && access.plan === "pro";
  const maxAccounts = access.mode === "trial" ? 1 : isPro ? 10 : 1;

  try {
    if (valid.length === 1) {
      const line = credToLine(valid[0]);
      const thinkMsg = await ctx.reply("⏳ Đang kiểm tra...");
      const result = await checkSingle("account", line);
      await ctx.telegram.deleteMessage(ctx.chat!.id, thinkMsg.message_id).catch(() => {});
      await ctx.replyWithHTML(formatResult(result));
    } else if (access.mode === "trial") {
      // Trial cannot use bulk at all
      await ctx.replyWithHTML(
        "⛔ <b>Tính năng check hàng loạt yêu cầu key.</b>\n\n" +
        "Lần dùng thử miễn phí chỉ cho phép check <b>1 tài khoản</b> mỗi lần.\n\n" +
        "Dán key vào chat để mở khoá tính năng này.",
        Markup.inlineKeyboard([[Markup.button.callback("🛒 Mua Key", "buy_key")]])
      );
      return;
    } else if (valid.length > maxAccounts) {
      // Key plan limit exceeded
      if (maxAccounts === 1) {
        await ctx.replyWithHTML(
          `⛔ <b>Gói Basic chỉ cho phép check 1 tài khoản mỗi lần.</b>\n\n` +
          `Bạn đang gửi <b>${valid.length} tài khoản</b>.\n\n` +
          "Nâng cấp lên <b>Pro</b> để check tối đa 10 tài khoản mỗi lần.",
          Markup.inlineKeyboard([[Markup.button.callback("🟣 Nâng cấp Pro", "plan_pro")]])
        );
      } else {
        await ctx.replyWithHTML(
          `⛔ <b>Gói Pro chỉ cho phép check tối đa 10 tài khoản mỗi lần.</b>\n\n` +
          `Bạn đang gửi <b>${valid.length} tài khoản</b>.\n\n` +
          "Vui lòng chia nhỏ danh sách thành từng đợt tối đa 10 tài khoản."
        );
      }
      return;
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

// ─── Bilingual Button Labels ──────────────────────────────────────────────────

const BTN_VI = {
  CHECK:    "🔍 Check tài khoản",
  STATUS:   "📊 Trạng thái Key",
  ACTIVATE: "🔑 Kích hoạt Key",
  BUY:      "🛒 Mua Key",
  BULK:     "📦 Bulk Check",
  HELP:     "📖 Hướng dẫn",
  TRY:      "🎁 Dùng thử miễn phí",
} as const;

const BTN_EN = {
  CHECK:    "🔍 Check Account",
  STATUS:   "📊 Key Status",
  ACTIVATE: "🔑 Activate Key",
  BUY:      "🛒 Buy Key",
  BULK:     "📦 Bulk Check",
  HELP:     "📖 Help",
  TRY:      "🎁 Free Trial",
} as const;

/** All keyboard texts (both languages) — skip credential parsing */
const KEYBOARD_TEXTS = new Set([...Object.values(BTN_VI), ...Object.values(BTN_EN)]);

function BTN(lang: Lang) { return lang === "en" ? BTN_EN : BTN_VI; }

/** Full menus */
const MAIN_KB_VI   = Markup.keyboard([[BTN_VI.CHECK, BTN_VI.STATUS], [BTN_VI.ACTIVATE, BTN_VI.BUY], [BTN_VI.BULK, BTN_VI.HELP]]).resize();
const MAIN_KB_EN   = Markup.keyboard([[BTN_EN.CHECK, BTN_EN.STATUS], [BTN_EN.ACTIVATE, BTN_EN.BUY], [BTN_EN.BULK, BTN_EN.HELP]]).resize();
const TRIAL_KB_VI  = Markup.keyboard([[BTN_VI.TRY]]).resize();
const TRIAL_KB_EN  = Markup.keyboard([[BTN_EN.TRY]]).resize();

function mainKeyboard(lang: Lang)  { return lang === "en" ? MAIN_KB_EN  : MAIN_KB_VI;  }
function trialKeyboard(lang: Lang) { return lang === "en" ? TRIAL_KB_EN : TRIAL_KB_VI; }

// ─── Bot setup ────────────────────────────────────────────────────────────────

export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // ── /start ──────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    if (!await guardRate(ctx)) return;
    const name = ctx.from.first_name ?? "bạn";
    const uid  = ctx.from.id;
    const telegramId = String(uid);
    const session = getSession(uid);

    // Resolve language: session → DB → null (need to select)
    let lang: Lang | null = session.lang ?? null;
    if (!lang) {
      lang = await getUserLanguage(telegramId);
      if (lang) setSession(uid, { lang });
    }

    // No language selected yet → show selector (first ever /start)
    if (!lang) {
      await ctx.replyWithHTML(
        "🌐 <b>Choose language / Chọn ngôn ngữ:</b>",
        Markup.inlineKeyboard([
          [Markup.button.callback("🇻🇳 Tiếng Việt", "lang_vi"),
           Markup.button.callback("🇬🇧 English",    "lang_en")],
        ])
      );
      return;
    }

    // Phase 3A: Has active key in session → full menu
    if (session.activeKey || session.activeKeyId) {
      await ctx.replyWithHTML(l(lang, "welcomeBackKey", { name: escHtml(name) }), mainKeyboard(lang));
      return;
    }

    const trial = await checkTrial(telegramId);

    // Phase 1: Still has trial → trial keyboard only
    if (trial.hasTrialLeft) {
      await ctx.replyWithHTML(
        l(lang, "welcomeNew", { name: escHtml(name), remaining: String(trial.remaining), limit: String(TRIAL_LIMIT) }),
        trialKeyboard(lang)
      );
      return;
    }

    // Phase 3B: Trial exhausted — check DB for returning customer
    const current = await getCurrentUserKey(telegramId).catch(() => null);
    const isReturning = current?.keyId != null;

    if (isReturning) {
      setSession(uid, { activeKeyId: current!.keyId, activeKeyDisplay: current!.keyDisplay });
      await ctx.replyWithHTML(l(lang, "welcomeBackExpired", { name: escHtml(name) }), mainKeyboard(lang));
      return;
    }

    // Phase 2: Trial exhausted, never bought → inline buy (no reply keyboard)
    const plans = await getPlans();
    const enabled = plans.filter(p => p.enabled);
    await ctx.replyWithHTML(
      l(lang, "welcomeExhausted", { limit: String(TRIAL_LIMIT) }),
      enabled.length > 0
        ? Markup.inlineKeyboard(enabled.map(p => [Markup.button.callback(`${p.emoji} ${p.name}  —  ${fmtPlanPrice(p.price)}`, `plan_${p.slug}`)]))
        : Markup.inlineKeyboard([[Markup.button.callback(l(lang, "contactAdmin"), "contact_admin")]])
    );
  });

  // ── /help ───────────────────────────────────────────────────────────────────
  bot.help(async (ctx) => {
    const lang = getLang(ctx.from.id);
    await ctx.replyWithHTML(
      l(lang, "helpText", { limit: String(TRIAL_LIMIT) }),
      Markup.inlineKeyboard([[Markup.button.callback(l(lang, "langBtn"), "show_lang_selector")]])
    );
  });

  // ── /lang ────────────────────────────────────────────────────────────────────
  bot.command("lang", async (ctx) => {
    await ctx.replyWithHTML(
      "🌐 <b>Choose language / Chọn ngôn ngữ:</b>",
      Markup.inlineKeyboard([[
        Markup.button.callback("🇻🇳 Tiếng Việt", "lang_vi"),
        Markup.button.callback("🇬🇧 English",    "lang_en"),
      ]])
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

    // Bulk check requires an active key (trial is NOT enough)
    if (!session.activeKey) {
      await ctx.replyWithHTML(
        "⛔ <b>Tính năng check hàng loạt yêu cầu key.</b>\n\n" +
        "Lần dùng thử miễn phí chỉ cho phép check <b>1 tài khoản</b> mỗi lần.\n\n" +
        "Dán key vào chat hoặc dùng /activate để kích hoạt.",
        Markup.inlineKeyboard([[Markup.button.callback("🛒 Mua Key", "buy_key")]])
      );
      return;
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

    // Trial users cannot use bulk
    if (access.mode === "trial") {
      if (keyId !== undefined) await releaseKey(keyId).catch(() => {});
      await ctx.replyWithHTML(
        "⛔ <b>Tính năng check hàng loạt yêu cầu key.</b>\n\nDán key vào chat để mở khoá.",
        Markup.inlineKeyboard([[Markup.button.callback("🛒 Mua Key", "buy_key")]])
      );
      return;
    }

    // Per-plan account limit per submission
    const isPro = access.mode === "key" && access.plan === "pro";
    const maxAccounts = isPro ? 10 : 1;

    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const resp = await fetch(fileLink.href);
      const text = await resp.text();
      const allLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      if (allLines.length === 0) {
        await ctx.reply("❌ File trống");
        return;
      }

      // Basic plan: only first line is allowed
      if (maxAccounts === 1 && allLines.length > 1) {
        if (keyId !== undefined) await releaseKey(keyId).catch(() => {});
        await ctx.replyWithHTML(
          `⛔ <b>Gói Basic chỉ cho phép check 1 tài khoản mỗi lần.</b>\n\n` +
          `File của bạn có <b>${allLines.length} dòng</b>.\n\n` +
          "Nâng cấp lên <b>Pro</b> để gửi tối đa 10 tài khoản mỗi lần.",
          Markup.inlineKeyboard([[Markup.button.callback("🟣 Nâng cấp Pro", "plan_pro")]])
        );
        return;
      }

      // Pro plan: max 10 accounts per submission
      const lines = allLines.slice(0, maxAccounts);
      if (allLines.length > maxAccounts) {
        await ctx.reply(`⚠️ Chỉ xử lý ${maxAccounts} tài khoản đầu tiên. Vui lòng chia nhỏ danh sách.`);
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
        "Dán <code>email|password</code> vào chat để bắt đầu check ngay!",
      ];
      // Switch to full menu after successful activation
      await ctx.replyWithHTML(lines.join("\n"), mainKeyboard(getLang(uid)));
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

  // ── Helpers for status rendering ─────────────────────────────────────────────
  function formatUsage(used: number, max: number | null | undefined): string {
    if (max == null) return `${used} / ∞`;
    return `${used} / ${max}`;
  }

  function usageBar(used: number, max: number | null | undefined, width = 10): string {
    if (max == null || max === 0) return "";
    const filled = Math.min(width, Math.round((used / max) * width));
    return "▓".repeat(filled) + "░".repeat(width - filled);
  }

  function buildStatusLines(key: string, v: Awaited<ReturnType<typeof validateKey>>, trialInfo?: { remaining: number }) {
    const lines: string[] = ["📊 <b>Trạng thái Key</b>", ""];

    if (trialInfo) {
      lines.push(`🔑 Key: <i>Chưa kích hoạt</i>`);
      lines.push(`🎁 Dùng thử miễn phí: <b>${trialInfo.remaining}/${TRIAL_LIMIT}</b> còn lại`);
      return lines;
    }

    lines.push(`🔑 Key: <code>${escHtml(key.slice(0, 8))}***</code>`);

    if (!v.valid) {
      const reasonMap: Record<string, string> = {
        expired:        "⌛ Key đã hết hạn",
        locked:         "🔒 Key đang bị khoá",
        revoked:        "❌ Key đã bị thu hồi",
        total_exceeded: "🔢 Đã hết tổng lượt dùng",
        daily_exceeded: "📊 Đã hết lượt dùng hôm nay",
        not_found:      "❓ Key không tồn tại",
      };
      lines.push(`🔴 Trạng thái: <b>Không hợp lệ</b>`);
      lines.push(`❌ ${reasonMap[v.reason ?? ""] ?? v.reason ?? "Lỗi không xác định"}`);
      return lines;
    }

    lines.push(`🟢 Trạng thái: <b>Hợp lệ</b>`);

    // Expiry
    if (v.expiresAt) {
      const exp = new Date(v.expiresAt);
      const daysLeft = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
      const dateStr = exp.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
      lines.push(`⌛ Hết hạn: <b>${dateStr}</b> (còn <b>${daysLeft}</b> ngày)`);
    } else {
      lines.push(`⌛ Hết hạn: <b>Không giới hạn</b>`);
    }

    // Total uses
    const totalUsed = v.totalUses ?? 0;
    const totalMax = v.maxTotalUses ?? null;
    const bar = usageBar(totalUsed, totalMax);
    lines.push(
      `🔢 Tổng lượt: <b>${formatUsage(totalUsed, totalMax)}</b>` +
      (bar ? `  <code>${bar}</code>` : "")
    );

    // Daily uses
    const dayUsed = v.dailyUses ?? 0;
    const dayMax = v.dailyLimit ?? null;
    if (dayMax != null) {
      const dayBar = usageBar(dayUsed, dayMax);
      lines.push(
        `📊 Hôm nay: <b>${formatUsage(dayUsed, dayMax)}</b>` +
        (dayBar ? `  <code>${dayBar}</code>` : "")
      );
    }

    return lines;
  }

  // ── Shared status display helper ─────────────────────────────────────────────
  async function handleStatusDisplay(ctx: Context) {
    const uid = ctx.from!.id;
    const telegramId = String(uid);
    const session = getSession(uid);

    // Path A: raw key in memory
    if (session.activeKey) {
      const v = await validateKey(session.activeKey, telegramId);
      const lines = buildStatusLines(session.activeKey, v);
      const exhausted = v.totalUsesLeft === 0 || (!v.valid && ["expired","total_exceeded","revoked"].includes(v.reason ?? ""));
      if (!v.valid) setSession(uid, { activeKey: undefined, activeKeyId: undefined });
      await ctx.replyWithHTML(lines.join("\n"),
        exhausted ? Markup.inlineKeyboard([[Markup.button.callback("🔄 Gia hạn / Mua key mới", "buy_key")]]) : undefined);
      return;
    }

    // Path B: check DB restore if needed
    if (!session.activeKeyId && !session.dbSessionChecked) {
      setSession(uid, { dbSessionChecked: true });
      const current = await getCurrentUserKey(telegramId);
      if (current.hasKey && current.keyId) {
        setSession(uid, { activeKeyId: current.keyId, activeKeyDisplay: current.keyDisplay });
      }
    }

    // Path C: key ID restored from DB
    if (session.activeKeyId) {
      const current = await getCurrentUserKey(telegramId);
      if (current.hasKey) {
        // Build ValidateResponse-compatible object from current
        const v: ValidateResponse = {
          valid: current.valid ?? true,
          reason: current.reason,
          plan: current.plan,
          expiresAt: current.expiresAt,
          maxConcurrent: current.maxConcurrent,
          totalUses: current.totalUses,
          maxTotalUses: current.maxTotalUses,
          dailyUses: current.dailyUses,
          dailyLimit: current.dailyLimit,
          dailyUsesLeft: current.dailyUsesLeft,
          totalUsesLeft: current.totalUsesLeft,
        };
        const displayKey = session.activeKeyDisplay ?? current.keyDisplay ?? "***";
        const lines = buildStatusLines(displayKey, v);
        const exhausted = v.totalUsesLeft === 0 || (!v.valid && ["expired","total_exceeded","revoked"].includes(v.reason ?? ""));
        if (!v.valid) setSession(uid, { activeKeyId: undefined, activeKeyDisplay: undefined });
        await ctx.replyWithHTML(lines.join("\n"),
          exhausted ? Markup.inlineKeyboard([[Markup.button.callback("🔄 Gia hạn / Mua key mới", "buy_key")]]) : undefined);
        return;
      }
      // Key in DB is no longer valid — clear and fall through
      setSession(uid, { activeKeyId: undefined, activeKeyDisplay: undefined });
    }

    // No key — show trial status
    const trial = await checkTrial(telegramId);
    await ctx.replyWithHTML(
      buildStatusLines("", { valid: false } as ValidateResponse, { remaining: trial.remaining }).join("\n"),
      Markup.inlineKeyboard([[Markup.button.callback("🛒 Mua Key", "buy_key")]])
    );
  }

  // ── /status ─────────────────────────────────────────────────────────────────
  bot.command("status", async (ctx) => {
    if (!await guardRate(ctx)) return;
    await handleStatusDisplay(ctx);
  });

  // ── Inline button callbacks ──────────────────────────────────────────────────

  // ── Buy key flow ─────────────────────────────────────────────────────────────

  bot.action("buy_key", async (ctx) => {
    await ctx.answerCbQuery();
    const lang: Lang = getSession((ctx.from as any)?.id).lang ?? "vi";
    const plans = await getPlans();
    const enabled = plans.filter(p => p.enabled);
    if (enabled.length === 0) { await ctx.replyWithHTML(l(lang, "buyNoPlan")); return; }
    await ctx.replyWithHTML(
      l(lang, "buyHeader"),
      Markup.inlineKeyboard(enabled.map(p => [Markup.button.callback(`${p.emoji} ${p.name}  —  ${fmtPlanPrice(p.price)}`, `plan_${p.slug}`)]))
    );
  });

  // Show/hide language selector from Help button
  bot.action("show_lang_selector", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML("🌐 <b>Choose language / Chọn ngôn ngữ:</b>",
      Markup.inlineKeyboard([[Markup.button.callback("🇻🇳 Tiếng Việt", "lang_vi"), Markup.button.callback("🇬🇧 English", "lang_en")]])
    );
  });

  // Helper: show plan detail
  async function showPlanDetail(ctx: Context, slug: string) {
    await (ctx as any).answerCbQuery();
    const lang: Lang = getSession((ctx.from as any)?.id).lang ?? "vi";
    const plans = await getPlans();
    const plan = plans.find(p => p.slug === slug);
    if (!plan || !plan.enabled) {
      await ctx.reply(lang === "en" ? "⚠️ This plan is not available." : "⚠️ Gói này hiện không khả dụng.");
      return;
    }
    await ctx.replyWithHTML(
      `${plan.emoji} <b>${plan.name} — ${fmtPlanPrice(plan.price)}</b>\n\n${plan.description}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(l(lang, "buyNow", { name: plan.name }), `buy_${slug}`)],
        [Markup.button.callback(l(lang, "buyBack"), "buy_key")],
      ])
    );
  }

  // ── Language selection actions ────────────────────────────────────────────────
  async function applyLang(ctx: any, lang: Lang) {
    await ctx.answerCbQuery();
    const uid = ctx.from?.id;
    const telegramId = String(uid);
    setSession(uid, { lang });
    await saveUserLanguage(telegramId, lang);
    const name = ctx.from?.first_name ?? (lang === "en" ? "you" : "bạn");
    await ctx.replyWithHTML(l(lang, "langChanged"), { reply_markup: undefined });

    // Now proceed with normal /start flow
    const session = getSession(uid);
    const trial = await checkTrial(telegramId);
    if (session.activeKey || session.activeKeyId) {
      await ctx.replyWithHTML(l(lang, "welcomeBackKey", { name: escHtml(name) }), mainKeyboard(lang));
    } else if (trial.hasTrialLeft) {
      await ctx.replyWithHTML(
        l(lang, "welcomeNew", { name: escHtml(name), remaining: String(trial.remaining), limit: String(TRIAL_LIMIT) }),
        trialKeyboard(lang)
      );
    } else {
      const current = await getCurrentUserKey(telegramId).catch(() => null);
      if (current?.keyId) {
        setSession(uid, { activeKeyId: current.keyId, activeKeyDisplay: current.keyDisplay });
        await ctx.replyWithHTML(l(lang, "welcomeBackExpired", { name: escHtml(name) }), mainKeyboard(lang));
      } else {
        const plans = await getPlans();
        const enabled = plans.filter(p => p.enabled);
        await ctx.replyWithHTML(
          l(lang, "welcomeExhausted", { limit: String(TRIAL_LIMIT) }),
          enabled.length > 0
            ? Markup.inlineKeyboard(enabled.map(p => [Markup.button.callback(`${p.emoji} ${p.name}  —  ${fmtPlanPrice(p.price)}`, `plan_${p.slug}`)]))
            : Markup.inlineKeyboard([[Markup.button.callback(l(lang, "contactAdmin"), "contact_admin")]])
        );
      }
    }
  }

  bot.action("lang_vi", (ctx) => applyLang(ctx, "vi"));
  bot.action("lang_en", (ctx) => applyLang(ctx, "en"));

  // Dynamic plan detail handler — supports any slug (basic, pro, vip, etc.)
  bot.action(/^plan_(.+)$/, (ctx) => showPlanDetail(ctx, (ctx as any).match[1]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const showPaymentInfo = async (ctx: any, slug: string) => {
    await ctx.answerCbQuery();
    const uid  = ctx.from?.id;
    const lang: Lang = getSession(uid).lang ?? "vi";
    const plans = await getPlans();
    const planCfg = plans.find(pl => pl.slug === slug);

    const priceStr = planCfg ? fmtPlanPrice(planCfg.price) : "—";
    const emoji    = planCfg?.emoji ?? "💳";
    const planName = planCfg?.name ?? slug;
    const label    = `${emoji} ${planName} — ${priceStr}`;

    const telegramId = String(ctx.from?.id);
    const username   = ctx.from?.username;

    // For English users with USDT wallet configured → show USDT payment (manual)
    const p = await getPrices();
    if (lang === "en" && p.usdt?.wallet) {
      try {
        const order = await createOrder(telegramId, slug, username);
        if (order.error) throw new Error(order.error);
        const usdtAmount = (order.amount / (p.usdt.rateVnd || 25000)).toFixed(2);
        const rate = (p.usdt.rateVnd || 25000).toLocaleString("vi-VN");
        await ctx.replyWithHTML(l(lang, "paymentUsdt", {
          label, usdtAmount, wallet: p.usdt.wallet, orderCode: order.orderCode, rate,
        }));
      } catch {
        await ctx.replyWithHTML(l(lang, "paymentNoConfig", { label }));
      }
      return;
    }

    // VND bank transfer flow (existing QR)
    try {
      const order = await createOrder(telegramId, slug, username);
      if (order.error) throw new Error(order.error);

      const caption = l(lang, "paymentBankCaption", {
        label,
        bankName: order.bank.name,
        bankAccount: order.bank.account,
        bankHolder: order.bank.holder,
        amount: order.amountFormatted,
        orderCode: order.orderCode,
      });

      const sent = await ctx.replyWithPhoto(order.qrUrl, { caption, parse_mode: "HTML" });
      if (sent?.message_id) await saveOrderQrMessageId(order.orderId, sent.message_id);
    } catch {
      await ctx.replyWithHTML(l(lang, "paymentNoConfig", { label }));
    }
  };

  // Dynamic handler: matches buy_basic, buy_pro, buy_<any-slug>
  bot.action(/^buy_(.+)$/, (ctx) => showPaymentInfo(ctx, (ctx as any).match[1]));

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

  bot.action("show_help", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
      "<b>📖 Hướng dẫn sử dụng</b>\n\n" +
      "<b>✨ Dán thẳng vào chat — không cần gõ lệnh:</b>\n\n" +
      "🔑 <b>Kích hoạt key:</b>\n" +
      "<code>KGPT-XXXXXX-XXXXXX-XXXXXX</code>\n\n" +
      "🔍 <b>Check tài khoản:</b>\n" +
      "<code>email|password</code>\n" +
      "<code>email|password|TOTP_SECRET</code>\n" +
      "Nhiều tài khoản: mỗi dòng 1 tài khoản\n\n" +
      "<b>📋 Lệnh nhanh:</b>\n" +
      "/check — Check ngay tại chat\n" +
      "/bulk — Upload file .txt check hàng loạt\n" +
      "/activate — Kích hoạt key\n" +
      "/status — Xem lượt dùng & hết hạn\n\n" +
      "<i>💡 Mỗi người mới được dùng thử miễn phí 3 lần.</i>",
      Markup.inlineKeyboard([
        [Markup.button.callback("🔍 Check ngay", "help_check")],
        [Markup.button.callback("🛒 Mua Key",    "buy_key")],
      ])
    );
  });

  bot.action("cmd_status", async (ctx) => {
    await ctx.answerCbQuery();
    await handleStatusDisplay(ctx);
  });

  // ── Reply-keyboard button handlers ─────────────────────────────────────────
  // ── Reply-keyboard button handlers (bilingual) ────────────────────────────────
  function getLang(uid: number): Lang { return getSession(uid).lang ?? "vi"; }

  bot.hears([BTN_VI.TRY, BTN_EN.TRY], async (ctx) => {
    if (!await guardRate(ctx)) return;
    const uid = ctx.from.id;
    const lang = getLang(uid);
    const trial = await checkTrial(String(uid));
    await ctx.replyWithHTML(l(lang, "tryInstructions", { remaining: String(trial.remaining), limit: String(TRIAL_LIMIT) }));
  });

  bot.hears([BTN_VI.CHECK, BTN_EN.CHECK], async (ctx) => {
    if (!await guardRate(ctx)) return;
    await ctx.replyWithHTML(l(getLang(ctx.from.id), "checkInstructions"));
  });

  bot.hears([BTN_VI.STATUS, BTN_EN.STATUS], async (ctx) => {
    if (!await guardRate(ctx)) return;
    await handleStatusDisplay(ctx);
  });

  bot.hears([BTN_VI.ACTIVATE, BTN_EN.ACTIVATE], async (ctx) => {
    await ctx.replyWithHTML(l(getLang(ctx.from.id), "activateInstructions"));
  });

  bot.hears([BTN_VI.BUY, BTN_EN.BUY], async (ctx) => {
    const lang = getLang(ctx.from.id);
    const plans = await getPlans();
    const enabled = plans.filter(p => p.enabled);
    if (enabled.length === 0) {
      await ctx.replyWithHTML(l(lang, "buyNoPlan")); return;
    }
    await ctx.replyWithHTML(
      l(lang, "buyHeader"),
      Markup.inlineKeyboard(enabled.map(p => [Markup.button.callback(`${p.emoji} ${p.name}  —  ${fmtPlanPrice(p.price)}`, `plan_${p.slug}`)]))
    );
  });

  bot.hears([BTN_VI.BULK, BTN_EN.BULK], async (ctx) => {
    if (!await guardRate(ctx)) return;
    const uid = ctx.from.id;
    const lang = getLang(uid);
    const session = getSession(uid);
    if (!session.activeKey) {
      await ctx.replyWithHTML(
        l(lang, "bulkRequiresKey"),
        Markup.inlineKeyboard([[Markup.button.callback(l(lang, "buyBtn"), "buy_key")]])
      ); return;
    }
    setSession(uid, { waitingBulk: true });
    await ctx.replyWithHTML(l(lang, "bulkUploadPrompt") + `\n\n<i>Telegram ID: <code>${uid}</code></i>`);
  });

  bot.hears([BTN_VI.HELP, BTN_EN.HELP], async (ctx) => {
    const lang = getLang(ctx.from.id);
    await ctx.replyWithHTML(
      l(lang, "helpText", { limit: String(TRIAL_LIMIT) }),
      Markup.inlineKeyboard([[Markup.button.callback(l(lang, "langBtn"), "show_lang_selector")]])
    );
  });

  // ── Plain-text message → auto detect key OR credentials ────────────────────
  bot.on("text", async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;

    const raw = ctx.message.text.trim();

    // Ignore commands (handled above)
    if (raw.startsWith("/")) return;

    // Ignore reply-keyboard button texts (handled by bot.hears above)
    if (KEYBOARD_TEXTS.has(raw as typeof BTN[keyof typeof BTN])) return;

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
      await ctx.telegram.deleteMessage(ctx.chat!.id, thinkMsg.message_id).catch(() => {});

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
