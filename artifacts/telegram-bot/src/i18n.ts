/**
 * Bilingual string table — Vietnamese (vi) and English (en).
 * Usage: l("en", "welcomeNew", { name: "Alice", remaining: "3", limit: "3" })
 */

export type Lang = "vi" | "en";

const T = {
  // ── Language selection ────────────────────────────────────────────────────
  chooseLang: {
    vi: "🌐 <b>Chọn ngôn ngữ / Choose language:</b>",
    en: "🌐 <b>Choose language / Chọn ngôn ngữ:</b>",
  },
  langChanged: {
    vi: "✅ Đã chuyển sang <b>Tiếng Việt</b>.",
    en: "✅ Switched to <b>English</b>.",
  },

  // ── Welcome ───────────────────────────────────────────────────────────────
  welcomeNew: {
    vi: "👋 Chào <b>{{name}}</b>! Tôi là <b>GPT Checker Bot</b> 🤖\n\nTool kiểm tra tài khoản ChatGPT nhanh nhất Việt Nam.\n\n🎁 Bạn có <b>{{remaining}}/{{limit}}</b> lần dùng thử miễn phí.\n\nDán <code>email|password|2fa</code> vào ô chat để check ngay!",
    en: "👋 Hi <b>{{name}}</b>! I'm <b>GPT Checker Bot</b> 🤖\n\nThe fastest ChatGPT account checker.\n\n🎁 You have <b>{{remaining}}/{{limit}}</b> free trial uses.\n\nPaste <code>email|password|2fa</code> into chat to check now!",
  },
  welcomeBackKey: {
    vi: "👋 Chào lại <b>{{name}}</b>!\n\nKey của bạn đang hoạt động. Dùng menu bên dưới để check tài khoản.",
    en: "👋 Welcome back <b>{{name}}</b>!\n\nYour key is active. Use the menu below to check accounts.",
  },
  welcomeBackExpired: {
    vi: "👋 Chào lại <b>{{name}}</b>!\n\nKey của bạn đã hết hạn hoặc cần kích hoạt lại.\nMua gói mới hoặc nhập key để tiếp tục.",
    en: "👋 Welcome back <b>{{name}}</b>!\n\nYour key has expired or needs to be reactivated.\nBuy a new plan or enter a key to continue.",
  },
  welcomeExhausted: {
    vi: "⚡ <b>Bạn đã dùng hết {{limit}} lần thử miễn phí!</b>\n\nMua gói để tiếp tục kiểm tra không giới hạn 👇",
    en: "⚡ <b>You've used all {{limit}} free trial uses!</b>\n\nBuy a plan to continue checking without limits 👇",
  },

  // ── Buttons ───────────────────────────────────────────────────────────────
  tryBtn:      { vi: "🎁 Dùng thử miễn phí",  en: "🎁 Free Trial"    },
  checkBtn:    { vi: "🔍 Check tài khoản",     en: "🔍 Check Account" },
  statusBtn:   { vi: "📊 Trạng thái Key",      en: "📊 Key Status"    },
  activateBtn: { vi: "🔑 Kích hoạt Key",       en: "🔑 Activate Key"  },
  buyBtn:      { vi: "🛒 Mua Key",             en: "🛒 Buy Key"       },
  bulkBtn:     { vi: "📦 Bulk Check",          en: "📦 Bulk Check"    },
  helpBtn:     { vi: "📖 Hướng dẫn",           en: "📖 Help"          },

  // ── Trial ────────────────────────────────────────────────────────────────
  tryInstructions: {
    vi: "🔍 <b>Cách dùng thử miễn phí:</b>\n\nDán thẳng tài khoản vào chat (không cần lệnh):\n<code>email|password</code>\n<code>email|password|TOTP_SECRET</code>\n\n🎁 Bạn còn <b>{{remaining}}/{{limit}}</b> lượt thử miễn phí.",
    en: "🔍 <b>How to use the free trial:</b>\n\nPaste your account directly into chat (no command needed):\n<code>email|password</code>\n<code>email|password|TOTP_SECRET</code>\n\n🎁 You have <b>{{remaining}}/{{limit}}</b> free trial uses left.",
  },
  trialLastUse: {
    vi: "✅ <b>Đây là lần dùng thử cuối ({{limit}}/{{limit}}).</b>\n\nMua gói để tiếp tục check không giới hạn sau lần này 👇",
    en: "✅ <b>This is your last free trial use ({{limit}}/{{limit}}).</b>\n\nBuy a plan to keep checking without limits 👇",
  },
  trialExhausted: {
    vi: "⛔ Bạn đã dùng hết {{limit}} lần thử miễn phí.\n\nNhập <code>/activate KGPT-XXXXXX-XXXXXX-XXXXXX</code> để kích hoạt key.\nHoặc nhấn nút bên dưới để mua key.",
    en: "⛔ You've used all {{limit}} free trial uses.\n\nEnter <code>/activate KGPT-XXXXXX-XXXXXX-XXXXXX</code> to activate a key.\nOr tap below to buy a plan.",
  },

  // ── Buy flow ─────────────────────────────────────────────────────────────
  buyHeader:  { vi: "🛒 <b>Chọn gói phù hợp với bạn:</b>", en: "🛒 <b>Choose the right plan for you:</b>" },
  buyNoPlan:  { vi: "⚠️ Hiện tại chưa có gói nào đang mở bán. Vui lòng liên hệ admin.", en: "⚠️ No plans are currently available. Please contact admin." },
  buyBack:    { vi: "⬅️ Quay lại",          en: "⬅️ Back"               },
  buyNow:     { vi: "💳 Mua gói {{name}}",  en: "💳 Buy {{name}} plan"  },
  contactAdmin: { vi: "📞 Liên hệ admin",   en: "📞 Contact admin"       },

  // ── Payment — bank (automatic via SePay) ─────────────────────────────────
  paymentBankCaption: {
    vi: "💳 <b>Thanh toán gói {{label}}</b>\n\n🏦 Ngân hàng: <b>{{bankName}}</b>\n💳 Số tài khoản: <code>{{bankAccount}}</code>\n👤 Chủ TK: <b>{{bankHolder}}</b>\n💰 Số tiền: <b>{{amount}}</b>\n📝 Nội dung CK: <code>{{orderCode}}</code>\n\n⚠️ <b>Nhập đúng nội dung chuyển khoản — hệ thống tự giao key sau khi nhận tiền!</b>\n\n⏰ Đơn hàng hết hạn sau 30 phút.",
    en: "💳 <b>Payment for {{label}} plan</b>\n\n🏦 Bank: <b>{{bankName}}</b>\n💳 Account: <code>{{bankAccount}}</code>\n👤 Holder: <b>{{bankHolder}}</b>\n💰 Amount: <b>{{amount}}</b>\n📝 Transfer note: <code>{{orderCode}}</code>\n\n⚠️ <b>Enter the exact transfer note — system delivers key automatically after payment!</b>\n\n⏰ Order expires in 30 minutes.",
  },
  // ── Payment — USDT (manual, English users) ────────────────────────────────
  paymentUsdt: {
    vi: "💰 <b>Thanh toán USDT gói {{label}}</b>\n\n💎 Gửi <b>{{usdtAmount}} USDT</b> (TRC20) đến ví:\n<code>{{wallet}}</code>\n\n📝 Nội dung: <code>{{orderCode}}</code>\n\n⚠️ <b>Sau khi gửi, chụp ảnh giao dịch và nhắn cho admin để nhận key.</b>\n\nTỷ giá tham khảo: 1 USDT ≈ {{rate}}đ",
    en: "💰 <b>USDT Payment for {{label}} plan</b>\n\n💎 Send <b>{{usdtAmount}} USDT</b> (TRC20) to this wallet:\n<code>{{wallet}}</code>\n\n📝 Note: <code>{{orderCode}}</code>\n\n⚠️ <b>After sending, share your transaction screenshot with admin to receive your key.</b>\n\nRate: 1 USDT ≈ {{rate}} VND",
  },
  paymentNoConfig: {
    vi: "💳 <b>Mua gói {{label}}</b>\n\nVui lòng liên hệ admin để thanh toán và nhận key.\n\nSau khi nhận key:\n<code>/activate KGPT-XXXXXX-XXXXXX-XXXXXX</code>",
    en: "💳 <b>Buy {{label}} plan</b>\n\nPlease contact admin to make payment and receive your key.\n\nOnce you have your key:\n<code>/activate KGPT-XXXXXX-XXXXXX-XXXXXX</code>",
  },

  // ── Check ─────────────────────────────────────────────────────────────────
  checkInstructions: {
    vi: "🔍 <b>Cách check tài khoản:</b>\n\nDán thẳng vào chat (không cần lệnh):\n<code>email|password</code>\n<code>email|password|TOTP_SECRET</code>\n\nNhiều tài khoản: mỗi dòng 1 tài khoản.\n\nHoặc dùng /bulk để upload file .txt check hàng loạt.",
    en: "🔍 <b>How to check accounts:</b>\n\nPaste directly into chat (no command needed):\n<code>email|password</code>\n<code>email|password|TOTP_SECRET</code>\n\nMultiple accounts: one per line.\n\nOr use /bulk to upload a .txt file for bulk checking.",
  },

  // ── Status ────────────────────────────────────────────────────────────────
  statusNoKey: {
    vi: "⚠️ Bạn chưa kích hoạt key.\n\nDán key vào chat hoặc dùng /activate để kích hoạt.",
    en: "⚠️ You haven't activated a key yet.\n\nPaste your key into chat or use /activate to activate it.",
  },

  // ── Activate ──────────────────────────────────────────────────────────────
  activateInstructions: {
    vi: "🔑 <b>Cách kích hoạt key:</b>\n\nDán thẳng key vào chat (không cần lệnh):\n<code>KGPT-XXXXXX-XXXXXX-XXXXXX</code>\n\nHoặc dùng lệnh: <code>/activate KGPT-XXXXXX-XXXXXX-XXXXXX</code>",
    en: "🔑 <b>How to activate your key:</b>\n\nPaste your key directly into chat (no command needed):\n<code>KGPT-XXXXXX-XXXXXX-XXXXXX</code>\n\nOr use the command: <code>/activate KGPT-XXXXXX-XXXXXX-XXXXXX</code>",
  },
  activateSuccess: {
    vi: "✅ <b>Key kích hoạt thành công!</b>",
    en: "✅ <b>Key activated successfully!</b>",
  },
  activateStartCheck: {
    vi: "Dán <code>email|password</code> vào ô chat để bắt đầu check ngay!",
    en: "Paste <code>email|password</code> into chat to start checking now!",
  },
  activateProcessing: {
    vi: "⏳ Đang kích hoạt key...",
    en: "⏳ Activating key...",
  },
  activateUsageField: {
    vi: "Dùng /check để bắt đầu kiểm tra tài khoản.",
    en: "Use /check to start checking accounts.",
  },

  // ── Bulk check ────────────────────────────────────────────────────────────
  bulkRequiresKey: {
    vi: "⛔ <b>Tính năng check hàng loạt yêu cầu key.</b>\n\nLần dùng thử chỉ cho phép check <b>1 tài khoản</b> mỗi lần.\n\nDán key vào chat hoặc dùng /activate để kích hoạt.",
    en: "⛔ <b>Bulk checking requires a key.</b>\n\nFree trial only allows checking <b>1 account</b> at a time.\n\nPaste your key into chat or use /activate to activate it.",
  },
  bulkUploadPrompt: {
    vi: "📤 <b>Gửi file .txt chứa danh sách tài khoản.</b>\n\nMỗi dòng 1 tài khoản, định dạng:\n<code>email|password</code>\n<code>email|password|2fa_secret</code>\n\nTối đa <b>500</b> dòng mỗi lần.",
    en: "📤 <b>Send a .txt file with your account list.</b>\n\nOne account per line, format:\n<code>email|password</code>\n<code>email|password|2fa_secret</code>\n\nMax <b>500</b> lines per batch.",
  },

  // ── Help ──────────────────────────────────────────────────────────────────
  helpText: {
    vi: "<b>📖 Hướng dẫn sử dụng</b>\n\n<b>✨ Dán thẳng vào chat — không cần gõ lệnh:</b>\n\n🔑 <b>Kích hoạt key:</b>\n<code>KGPT-XXXXXX-XXXXXX-XXXXXX</code>\n\n🔍 <b>Check tài khoản:</b>\n<code>email|password</code>\n<code>email|password|TOTP_SECRET</code>\nNhiều tài khoản: mỗi dòng 1 tài khoản\n\n<b>📋 Lệnh nhanh:</b>\n/check — Check ngay tại chat\n/bulk — Upload file check hàng loạt\n/status — Xem trạng thái key\n/lang — Đổi ngôn ngữ\n\n<b>Lưu ý:</b> Mỗi người dùng mới được dùng thử miễn phí {{limit}} lần.",
    en: "<b>📖 Help & Guide</b>\n\n<b>✨ Paste directly into chat — no commands needed:</b>\n\n🔑 <b>Activate key:</b>\n<code>KGPT-XXXXXX-XXXXXX-XXXXXX</code>\n\n🔍 <b>Check account:</b>\n<code>email|password</code>\n<code>email|password|TOTP_SECRET</code>\nMultiple accounts: one per line\n\n<b>📋 Quick commands:</b>\n/check — Check account in chat\n/bulk — Upload file for bulk check\n/status — View key status\n/lang — Change language\n\n<b>Note:</b> New users get {{limit}} free trial uses.",
  },
  langBtn: { vi: "🌐 Đổi ngôn ngữ", en: "🌐 Change language" },

  // ── Phase 2: trial exhausted, have a key? ────────────────────────────────
  haveKey: {
    vi: "🔑 Đã có key? Nhấn bên dưới để kích hoạt:",
    en: "🔑 Already have a key? Tap below to activate:",
  },
};

export type StringKey = keyof typeof T;

/** Translate a string key with optional variable substitution */
export function l(lang: Lang, key: StringKey, vars?: Record<string, string>): string {
  const row = T[key];
  let text: string = row[lang] ?? row["vi"]; // fallback to Vietnamese
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{{${k}}}`, v);
    }
  }
  return text;
}
