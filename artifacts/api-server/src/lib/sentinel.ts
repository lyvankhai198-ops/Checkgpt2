/**
 * OpenAI Sentinel token generation — ported from Python sentinel.py
 * Handles the PoW (proof-of-work) challenge required for login flows.
 */

import * as crypto from "crypto";

const SENTINEL_REQ_URL = "https://sentinel.openai.com/backend-api/sentinel/req";
const SENTINEL_REFERER = "https://sentinel.openai.com/backend-api/sentinel/frame.html";
const SENTINEL_SDK_URL = "https://sentinel.openai.com/sentinel/20260124ceb8/sdk.js";
const MAX_POW_ATTEMPTS = 500_000;
const ERROR_PREFIX = "wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D";
const SENTINEL_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

const NAV_PROPS = [
  "vendorSub","productSub","vendor","maxTouchPoints","scheduling",
  "userActivation","doNotTrack","geolocation","connection","plugins",
  "mimeTypes","pdfViewerEnabled","webkitTemporaryStorage",
  "webkitPersistentStorage","hardwareConcurrency","cookieEnabled",
  "credentials","mediaDevices","permissions","locks","ink",
];
const CHOICE_12 = ["location","implementation","URL","documentURI","compatMode"];
const CHOICE_13 = ["Object","Function","Array","Number","parseFloat","undefined"];
const CHOICE_17 = [4,8,12,16];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fnv1a32(text: string): string {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h.toString(16).padStart(8, "0");
}

function b64EncodeConfig(config: unknown[]): string {
  const raw = JSON.stringify(config);
  return Buffer.from(raw, "utf-8").toString("base64");
}

function buildConfig(userAgent: string): unknown[] {
  const now = new Date();
  const dateStr = now.toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
  const perfNow = Math.random() * 49000 + 1000;
  const timeOrigin = now.getTime() - perfNow;
  const navProp = randomChoice(NAV_PROPS);
  const sid = crypto.randomUUID();

  return [
    "1920x1080",
    dateStr,
    4294705152,
    Math.random(),
    userAgent,
    SENTINEL_SDK_URL,
    null,
    null,
    "en-US",
    "en-US,en",
    Math.random(),
    `${navProp}\u2212undefined`,
    randomChoice(CHOICE_12),
    randomChoice(CHOICE_13),
    perfNow,
    sid,
    "",
    randomChoice(CHOICE_17),
    timeOrigin,
  ];
}

function solvePow(seed: string, difficulty: string): string {
  const config = buildConfig(SENTINEL_UA);
  const dlen = difficulty.length;
  const start = Date.now();

  for (let nonce = 0; nonce < MAX_POW_ATTEMPTS; nonce++) {
    config[3] = nonce;
    config[9] = Date.now() - start;
    const encoded = b64EncodeConfig(config);
    const digest = fnv1a32(seed + encoded);
    if (digest.length >= dlen && digest.slice(0, dlen) <= difficulty) {
      return `gAAAAAB${encoded}~S`;
    }
  }

  const noneB64 = Buffer.from('"None"').toString("base64");
  return `gAAAAAB${ERROR_PREFIX}${noneB64}`;
}

function generateRequirementsToken(): string {
  const config = buildConfig(SENTINEL_UA);
  config[3] = 1;
  config[9] = Math.floor(Math.random() * 45 + 5);
  return `gAAAAAC${b64EncodeConfig(config)}`;
}

interface ChallengeResponse {
  token?: string;
  proofofwork?: {
    required?: boolean;
    seed?: string;
    difficulty?: string;
  };
}

async function fetchChallenge(
  deviceId: string,
  flow: string,
  requestP: string,
  cookies: string,
): Promise<ChallengeResponse | null> {
  const body = JSON.stringify({ p: requestP, id: deviceId, flow });
  try {
    const res = await fetch(SENTINEL_REQ_URL, {
      method: "POST",
      headers: {
        "Accept": "*/*",
        "Referer": SENTINEL_REFERER,
        "Origin": "https://sentinel.openai.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "text/plain;charset=UTF-8",
        "User-Agent": SENTINEL_UA,
        "Cookie": cookies,
      },
      body,
    });
    if (!res.ok) return null;
    return await res.json() as ChallengeResponse;
  } catch {
    return null;
  }
}

export async function getSentinelToken(
  deviceId: string,
  flow: string,
  cookies: string,
): Promise<string> {
  const did = deviceId || crypto.randomUUID();
  const reqP = generateRequirementsToken();

  const challenge = await fetchChallenge(did, flow, reqP, cookies);
  if (!challenge) {
    return JSON.stringify({ p: reqP, t: "", c: "", id: did, flow });
  }

  const cValue = (challenge.token || "").trim();
  const powInfo = challenge.proofofwork || {};
  const required = Boolean(powInfo.required);
  const seed = powInfo.seed || "";

  let pValue: string;
  if (required && seed) {
    const difficulty = powInfo.difficulty || "0";
    pValue = solvePow(seed, difficulty);
  } else {
    pValue = reqP;
  }

  return JSON.stringify({ p: pValue, t: "", c: cValue, id: did, flow });
}
