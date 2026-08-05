import type { CheckResult } from "./api.js";

// ─── Smart credential parser ──────────────────────────────────────────────────

export interface ParsedCred {
  email: string;
  password: string;
  totp: string;
}

export interface ParseResult {
  valid: ParsedCred[];
  errors: string[]; // HTML-safe error messages
}

export function isEmailLike(s: string): boolean {
  return /^[^\s@|]{1,64}@[^\s@|]{1,253}\.[^\s@|]{2,}$/.test(s.trim());
}

/**
 * Tokenises raw text then groups tokens into credentials.
 *
 * Handles all common paste formats:
 *   email|pass|2fa        — one line, pipe-separated
 *   email|pass            — one line, no 2FA
 *   email\npass\n2fa      — three lines, one credential
 *   email|pass\n2fa       — two lines (Telegram wrap)
 *
 * Rules:
 *   • Whitespace around | is stripped.
 *   • Each credential MUST start with a valid email.
 *   • Token immediately after email is the password (must not look like email).
 *   • Third token (if it doesn't look like email) is the 2FA secret.
 *   • Any token that should be an email but fails validation → error line.
 */
export function parseCredentials(rawText: string): ParseResult {
  // Tokenise: split by newlines, then each line by "|", trim each part
  const tokens: string[] = [];
  for (const line of rawText.split(/\r?\n/)) {
    for (const part of line.split("|")) {
      const t = part.trim();
      if (t) tokens.push(t);
    }
  }

  const valid: ParsedCred[] = [];
  const errors: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const t = tokens[i];

    // Every group must start with a valid email
    if (!isEmailLike(t)) {
      errors.push(`Dòng không hợp lệ (phải là email): <code>${escHtml(t.slice(0, 50))}</code>`);
      i++;
      continue;
    }

    const email = t;
    const next1 = tokens[i + 1];
    const next2 = tokens[i + 2];

    // Must have a password token
    if (!next1 || isEmailLike(next1)) {
      errors.push(`Thiếu mật khẩu cho: <code>${escHtml(email)}</code>`);
      i++;
      continue;
    }

    const password = next1;

    if (!next2 || isEmailLike(next2)) {
      // No 2FA
      valid.push({ email, password, totp: "" });
      i += 2;
    } else {
      // Has 2FA secret
      valid.push({ email, password, totp: next2 });
      i += 3;
    }
  }

  return { valid, errors };
}

/** Returns a preview line with password and 2FA masked */
export function maskCred(c: ParsedCred): string {
  const maskedPass = c.password.length > 2
    ? c.password.slice(0, 2) + "***"
    : "***";
  const totpPart = c.totp ? " | <i>***</i>" : "";
  return `<code>${escHtml(c.email)}</code> | ${maskedPass}${totpPart}`;
}

/** Build the canonical line string for a credential */
export function credToLine(c: ParsedCred): string {
  return c.totp ? `${c.email}|${c.password}|${c.totp}` : `${c.email}|${c.password}`;
}

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
