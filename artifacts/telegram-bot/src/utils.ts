import type { CheckResult } from "./api.js";

/** Format a date for display */
export function formatDate(d: string | Date | undefined | null): string {
  if (!d) return "Không giới hạn";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });
}

/** Format remaining time until a date */
export function formatExpiry(expiresAt: string | undefined | null): string {
  if (!expiresAt) return "Không hết hạn";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Đã hết hạn";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Format a single check result as Telegram markdown */
export function formatResult(r: CheckResult, idx?: number): string {
  const statusEmoji = {
    live: "✅",
    die: "❌",
    deactivated: "⚠️",
    locked: "🔒",
    error: "❓",
  }[r.status] ?? "❓";

  const lines: string[] = [];
  if (idx !== undefined) lines.push(`#${idx}`);
  lines.push(`${statusEmoji} <b>${r.status.toUpperCase()}</b>`);
  if (r.email) lines.push(`📧 <code>${escHtml(r.email)}</code>`);
  if (r.plan && r.status === "live") lines.push(`📦 Plan: <b>${escHtml(r.plan)}</b>`);
  if (r.user && r.status === "live") lines.push(`👤 ${escHtml(r.user)}`);
  if (r.error) lines.push(`⚠️ <i>${escHtml(r.error.slice(0, 100))}</i>`);
  return lines.join("\n");
}

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Simple per-user rate limiter (in-memory) */
export class RateLimiter {
  private map = new Map<string | number, { count: number; reset: number }>();
  constructor(private maxPerWindow: number, private windowMs: number) {}

  allow(id: string | number): boolean {
    const now = Date.now();
    const entry = this.map.get(id);
    if (!entry || now > entry.reset) {
      this.map.set(id, { count: 1, reset: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.maxPerWindow) return false;
    entry.count++;
    return true;
  }
}

/** Parse raw key from text — accepts with/without spaces or dashes */
export function parseKey(text: string): string | null {
  const cleaned = text.trim().toUpperCase().replace(/\s+/g, "-");
  if (/^KGPT-[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$/.test(cleaned)) return cleaned;
  return null;
}
