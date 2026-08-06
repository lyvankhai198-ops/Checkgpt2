/**
 * In-memory user session store.
 * Tracks per-user state: active key, pending bulk upload, concurrency slots.
 */

export interface UserSession {
  /** Raw key string (not hashed) — set when user types the key */
  activeKey?: string;
  /** keyId for releasing concurrency slots and DB-restored sessions */
  activeKeyId?: number;
  /** Masked key display (e.g. "KGPT-8CB5F2-DE...") — set when restored from DB */
  activeKeyDisplay?: string;
  /** true = already checked DB for currentKeyId this process lifetime, skip re-check */
  dbSessionChecked?: boolean;
  /** User's language preference */
  lang?: "vi" | "en";
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
