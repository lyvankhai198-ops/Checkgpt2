/**
 * In-memory user session store.
 * Tracks per-user state: active key, pending bulk upload, concurrency slots.
 */

export interface UserSession {
  /** Raw key string (not hashed) — stored only in memory for this session */
  activeKey?: string;
  /** keyId for releasing concurrency slots */
  activeKeyId?: number;
  /** Whether user is waiting to send a .txt file for bulk check */
  waitingBulk?: boolean;
  /** Concurrency slots currently occupied */
  concurrentSlots: number;
}

const sessions = new Map<number, UserSession>();

export function getSession(userId: number): UserSession {
  let s = sessions.get(userId);
  if (!s) {
    s = { concurrentSlots: 0 };
    sessions.set(userId, s);
  }
  return s;
}

export function setSession(userId: number, patch: Partial<UserSession>): void {
  const s = getSession(userId);
  Object.assign(s, patch);
}

export function clearSession(userId: number): void {
  sessions.delete(userId);
}
