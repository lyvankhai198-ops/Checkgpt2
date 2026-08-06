/**
 * Telegram Bot entry point.
 * Uses long-polling (getUpdates) — no webhook required.
 */

import { createBot } from "./bot.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("❌  TELEGRAM_BOT_TOKEN is not set. Set it in Replit Secrets and restart.");
  process.exit(1);
}

const bot = createBot(token);

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

console.log("🤖 Starting GPT Checker Bot (long-polling)...");
await bot.launch({ dropPendingUpdates: true });

// Register the "/" command menu shown in Telegram clients
await bot.telegram.setMyCommands([
  { command: "start",    description: "🏠 Menu chính" },
  { command: "check",    description: "🔍 Kiểm tra tài khoản ChatGPT" },
  { command: "bulk",     description: "📦 Check hàng loạt (upload file)" },
  { command: "activate", description: "🔑 Kích hoạt key" },
  { command: "status",   description: "📊 Xem trạng thái & lượt dùng key" },
  { command: "lang",     description: "🌐 Đổi ngôn ngữ / Change language" },
  { command: "help",     description: "📖 Hướng dẫn sử dụng" },
]);

console.log("✅  Bot is running.");
