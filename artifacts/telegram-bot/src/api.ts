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
  reason: string;
  expiresAt?: string;
  dailyUsesLeft?: number;
  totalUsesLeft?: number;
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

// ─── Check ────────────────────────────────────────────────────────────────────

export interface CheckResult {
  input: string;
  email: string | null;
  status: "live" | "die" | "deactivated" | "locked" | "error";
  user: string | null;
  plan: string | null;
  error: string | null;
}

export async function checkSingle(mode: "account" | "session", line: string): Promise<CheckResult> {
  return post("/api/check-single", { mode, rawText: line });
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
