/**
 * Typed API client — calls the local api-server at localhost:8080.
 * All key service operations go through REST to keep logic in one place.
 */

const BASE = process.env.API_BASE_URL ?? "http://localhost:8080";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T;
  return data;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  return res.json() as Promise<T>;
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export interface PlanConfig {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  enabled: boolean;
  price: number;
  description: string;
  durationDays: number | null;
  maxTotalUses: number | null;
  dailyLimit: number | null;
  maxConcurrent: number;
  bulkEnabled: boolean;
}

let _plansCache: PlanConfig[] | null = null;
let _plansCacheAt = 0;
const PLANS_TTL = 0; // Không cache — luôn fetch mới nhất từ DB

const DEFAULT_PLANS: PlanConfig[] = [
  {
    id: 1, slug: "basic", name: "Basic", emoji: "🟢", enabled: true, price: 20000,
    description:
      "⏱ Thời hạn: <b>1 ngày</b> kể từ lúc kích hoạt\n" +
      "🔢 Tổng lượt: <b>20 lượt</b>\n" +
      "🚫 Tối đa <b>1 tài khoản</b> mỗi lần\n" +
      "🔒 Key tự khoá khi hết 1 ngày <i>hoặc</i> hết 20 lượt",
    durationDays: 1, maxTotalUses: 20, dailyLimit: null, maxConcurrent: 1, bulkEnabled: false,
  },
  {
    id: 2, slug: "pro", name: "Pro", emoji: "🟣", enabled: true, price: 99000,
    description:
      "⏱ Thời hạn: <b>30 ngày</b> kể từ lúc kích hoạt\n" +
      "🔢 Tổng lượt: <b>30 lần gửi</b>\n" +
      "✅ Tối đa <b>10 tài khoản</b> mỗi lần\n" +
      "✅ Hỗ trợ check hàng loạt\n" +
      "🔒 Key tự khoá khi hết 30 ngày <i>hoặc</i> hết 30 lần gửi",
    durationDays: 30, maxTotalUses: 30, dailyLimit: null, maxConcurrent: 10, bulkEnabled: true,
  },
];

export async function getPlans(): Promise<PlanConfig[]> {
  if (_plansCache && Date.now() - _plansCacheAt < PLANS_TTL) return _plansCache;
  try {
    const data = await get<PlanConfig[]>("/api/plans");
    // API chỉ trả enabled plans — lưu vào cache
    if (Array.isArray(data) && data.length >= 0) {
      _plansCache = data;
      _plansCacheAt = Date.now();
    }
    return _plansCache ?? [];
  } catch {
    // Nếu API lỗi → dùng cache cũ, không fallback về hardcoded (tránh hiện gói đã tắt)
    return _plansCache ?? [];
  }
}

export function getPlanBySlug(plans: PlanConfig[], slug: string): PlanConfig | undefined {
  return plans.find(p => p.slug === slug);
}

export function fmtPlanPrice(price: number): string {
  return price.toLocaleString("vi-VN") + "đ";
}

// ─── Prices ───────────────────────────────────────────────────────────────────

export interface PricesResponse {
  basicPrice: number;
  proPrice: number;
  basicPriceFormatted: string;
  proPriceFormatted: string;
  paymentEnabled?: boolean;
  bank?: { name: string; bin: string; account: string; holder: string };
  usdt?: { wallet: string; rateVnd: number };
  adminContact?: string | null;
}

export interface OrderResponse {
  orderId: number;
  orderCode: string;
  amount: number;
  amountFormatted: string;
  expiresAt: string;
  qrUrl: string;
  bank: { name: string; account: string; holder: string };
  error?: string;
}

export async function createOrder(telegramId: string, plan: string, username?: string): Promise<OrderResponse> {
  return post<OrderResponse>("/api/payment/orders", { telegramId, plan, username });
}

export async function saveUserLanguage(telegramId: string, language: "vi" | "en", info?: { username?: string; firstName?: string }): Promise<void> {
  try { await post<unknown>("/api/users/language", { telegramId, language, ...info }); } catch { /* non-critical */ }
}

export async function getUserLanguage(telegramId: string): Promise<"vi" | "en" | null> {
  try {
    const r = await get<{ language: "vi" | "en" | null }>(`/api/users/language?telegramId=${encodeURIComponent(telegramId)}`);
    return r.language;
  } catch { return null; }
}

export async function saveOrderQrMessageId(orderId: number, messageId: number): Promise<void> {
  try {
    await post<unknown>(`/api/payment/orders/${orderId}/qr-message`, { messageId });
  } catch {
    // non-critical — deletion is best-effort
  }
}

let _pricesCache: PricesResponse | null = null;
let _pricesCacheAt = 0;
const PRICES_TTL = 5 * 60 * 1000; // 5 minutes

export async function getPrices(): Promise<PricesResponse> {
  if (_pricesCache && Date.now() - _pricesCacheAt < PRICES_TTL) return _pricesCache;
  try {
    const data = await get<PricesResponse>("/api/prices");
    _pricesCache = data;
    _pricesCacheAt = Date.now();
    return data;
  } catch {
    return _pricesCache ?? { basicPrice: 20000, proPrice: 99000, basicPriceFormatted: "20.000đ", proPriceFormatted: "99.000đ" };
  }
}

// ─── Trial ────────────────────────────────────────────────────────────────────

export interface TrialStatus {
  hasTrialLeft: boolean;
  remaining: number;
  total: number;
}

export async function checkTrial(telegramId: string): Promise<TrialStatus> {
  return post("/api/keys/trial/check", { telegramId });
}

export async function useTrial(telegramId: string): Promise<{ allowed: boolean; usedCount: number; remaining: number; reason?: string }> {
  return post("/api/keys/trial/use", { telegramId });
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export interface ValidateResponse {
  valid: boolean;
  reason?: string;
  plan?: string;          // "basic" | "pro"
  planName?: string;      // display name e.g. "Pro"
  planEmoji?: string;     // plan emoji e.g. "🟣"
  expiresAt?: string;
  maxConcurrent?: number;
  bulkEnabled?: boolean;
  maxBulkLines?: number;
  totalUses?: number;
  maxTotalUses?: number | null;
  dailyUses?: number;
  dailyLimit?: number | null;
  dailyUsesLeft?: number | null;
  totalUsesLeft?: number | null;
  retryAfter?: string;
}

export async function validateKey(rawKey: string, telegramId?: string): Promise<ValidateResponse> {
  const qs = new URLSearchParams({ key: rawKey });
  if (telegramId) qs.set("telegram_id", telegramId);
  return get(`/api/keys/validate?${qs}`);
}

export interface ActivateResponse {
  success: boolean;
  reason?: string;
  expiresAt?: string;
  maxConcurrent?: number;
  dailyLimit?: number;
  maxTotalUses?: number;
}

export async function activateKey(opts: {
  key: string;
  telegramId: string;
  username?: string;
  firstName?: string;
}): Promise<ActivateResponse> {
  return post("/api/keys/activate", opts);
}

export interface UseKeyResponse {
  allowed: boolean;
  keyId?: number;
  reason?: string;
  retryAfter?: string;
}

export async function useKey(rawKey: string, telegramId: string): Promise<UseKeyResponse> {
  return post("/api/keys/use", { key: rawKey, telegramId });
}

export async function releaseKey(keyId: number): Promise<void> {
  await post("/api/keys/release", { keyId });
}

// ─── Session restore (after bot restart) ──────────────────────────────────────

export interface UserCurrentKeyResponse {
  hasKey: boolean;
  keyId?: number;
  keyDisplay?: string;
  plan?: string;
  valid?: boolean;
  reason?: string;
  expiresAt?: string;
  maxConcurrent?: number;
  bulkEnabled?: boolean;
  maxBulkLines?: number;
  totalUses?: number;
  maxTotalUses?: number | null;
  dailyUses?: number;
  dailyLimit?: number | null;
  dailyUsesLeft?: number | null;
  totalUsesLeft?: number | null;
}

export async function getCurrentUserKey(telegramId: string): Promise<UserCurrentKeyResponse> {
  try {
    return await get(`/api/keys/user-current?telegramId=${encodeURIComponent(telegramId)}`);
  } catch {
    return { hasKey: false };
  }
}

export async function useKeyById(keyId: number, telegramId: string): Promise<UseKeyResponse> {
  return post("/api/keys/use-by-keyid", { keyId, telegramId });
}

// ─── Check ────────────────────────────────────────────────────────────────────

export interface CheckResult {
  input: string;
  email: string | null;
  status: "live" | "die" | "deactivated" | "locked" | "error";
  user: string | null;
  plan: string | null;
  error: string | null;
}

/**
 * Check a single account via the SSE /api/check endpoint — same code path as the web checker.
 * Falls back with one retry on transient network_error.
 */
export async function checkSingle(mode: "account" | "session", line: string): Promise<CheckResult> {
  async function attempt(): Promise<CheckResult | null> {
    return new Promise((resolve) => {
      let result: CheckResult | null = null;
      checkBulk({
        mode,
        rawText: line,
        concurrency: 1,
        onResult: (r) => { result = r; },
        onDone: () => resolve(result),
        onError: () => resolve(null),
      });
    });
  }

  const first = await attempt();
  if (first && first.status !== "error") return first;
  // If null (stream error) or transient network/error status — wait 2 s then retry once
  if (!first || first.error === "network_error" || first.status === "error") {
    await new Promise<void>((r) => setTimeout(r, 2000));
    const second = await attempt();
    if (second) return second;
  }
  // Return whatever we have, or a generic error result
  return first ?? {
    input: line,
    email: null,
    status: "error",
    user: null,
    plan: null,
    error: "network_error",
  };
}

/** Streams bulk check results via SSE, calling onResult for each account. */
export async function checkBulk(opts: {
  mode: "account" | "session";
  rawText: string;
  concurrency?: number;
  proxies?: string[];
  onResult: (result: CheckResult & { index: number; completed: number }) => void;
  onDone: (total: number) => void;
  onError?: (err: Error) => void;
}): Promise<void> {
  try {
    const res = await fetch(`${BASE}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: opts.mode,
        rawText: opts.rawText,
        concurrency: opts.concurrency ?? 2,
        proxies: opts.proxies ?? [],
      }),
    });

    if (!res.body) throw new Error("No SSE body");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const block of events) {
        for (const line of block.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "result") opts.onResult(ev.data);
            else if (ev.type === "done") opts.onDone(ev.total);
          } catch { /* ignore parse errors */ }
        }
      }
    }
  } catch (e) {
    opts.onError?.(e as Error);
  }
}
