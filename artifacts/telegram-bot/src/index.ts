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
console.log("✅  Bot is running.");
