import { Router } from "express";
import type { IRouter } from "express";
import { checkAccount, checkSessionToken } from "../lib/checker.js";
import { CheckAccountsBody, CheckSingleBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Load system proxy list from DB settings (cached 60s) */
let _proxyCacheAt = 0;
let _proxyCache: string[] = [];
async function getSystemProxies(): Promise<string[]> {
  if (Date.now() - _proxyCacheAt < 60_000) return _proxyCache;
  try {
    const [settings] = await db.select({ proxyList: settingsTable.proxyList })
      .from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);
    const raw = settings?.proxyList ?? "";
    _proxyCache = raw.split("\n").map(s => s.trim()).filter(Boolean);
    _proxyCacheAt = Date.now();
  } catch {
    // DB not ready — keep existing cache
  }
  return _proxyCache;
}

const router: IRouter = Router();

/** Round-robin proxy selector */
function makeProxyPicker(proxies: string[] | undefined) {
  if (!proxies || proxies.length === 0) return () => undefined;
  let idx = 0;
  return () => {
    const proxy = proxies[idx % proxies.length];
    idx++;
    return proxy;
  };
}

/** True nếu result là lỗi mạng (proxy chết / bị block) — nên retry không proxy */
function isNetworkError(r: { status: string; error: string | null }): boolean {
  return r.status === "error" || r.error === "network_error" || r.error === "login_network_error";
}

/** Check 1 account/session với proxy, fallback về direct nếu lỗi mạng */
async function checkWithFallback(
  mode: "account" | "session",
  line: string,
  proxyUrl: string | undefined,
): Promise<Awaited<ReturnType<typeof checkAccount>>> {
  async function runCheck(proxy: string | undefined) {
    if (mode === "account") {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length >= 3) return checkAccount(parts[0], parts[1], parts[2], proxy);
      if (parts.length === 2) return checkAccount(parts[0], parts[1], "", proxy);
      return {
        input: line.slice(0, 50), email: null, status: "error" as const,
        user: null, plan: null, error: "invalid format (need email|pass or email|pass|2fa)",
      };
    }
    return checkSessionToken(line, proxy);
  }

  const result = await runCheck(proxyUrl);

  // Nếu proxy gây lỗi mạng → thử lại không proxy
  if (proxyUrl && isNetworkError(result)) {
    const direct = await runCheck(undefined);
    // Trả direct nếu cho kết quả tốt hơn (live/die/deactivated/locked)
    if (!isNetworkError(direct)) return direct;
  }

  return result;
}

router.post("/check", async (req, res): Promise<void> => {
  const parsed = CheckAccountsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { mode, rawText, concurrency = 3, proxies: clientProxies } = parsed.data;
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    res.status(400).json({ error: "no input" });
    return;
  }

  // Merge: client-provided proxies take priority; fall back to system proxy list
  const sysProxies = await getSystemProxies();
  const proxies = (clientProxies && clientProxies.length > 0) ? clientProxies : sysProxies;

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "start", total: lines.length });

  const pickProxy = makeProxyPicker(proxies);
  let completed = 0;
  const sem = concurrency;
  let running = 0;
  let idx = 0;

  await new Promise<void>((resolve) => {
    const tryNext = () => {
      while (running < sem && idx < lines.length) {
        const i = idx++;
        const line = lines[i];
        const proxyUrl = pickProxy();
        running++;

        (async () => {
          const result = await checkWithFallback(mode, line, proxyUrl);

          completed++;
          send({
            type: "result",
            data: { ...result, index: i, completed },
          });
          running--;
          if (completed === lines.length) {
            resolve();
          } else {
            tryNext();
          }
        })().catch(() => {
          completed++;
          running--;
          if (completed === lines.length) resolve();
          else tryNext();
        });
      }
    };

    tryNext();
  });

  send({ type: "done", total: lines.length });
  res.end();
});

router.post("/check-single", async (req, res): Promise<void> => {
  const parsed = CheckSingleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { mode, rawText, proxies: clientProxies } = parsed.data;
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    res.status(400).json({ error: "no input" });
    return;
  }

  // Use client proxies if provided, else fall back to system proxy list
  const sysProxies = await getSystemProxies();
  const proxies = (clientProxies && clientProxies.length > 0) ? clientProxies : sysProxies;
  const proxyUrl = proxies.length > 0 ? proxies[0] : undefined;
  const line = lines[0];

  if (mode === "account") {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 2) { res.status(400).json({ error: "invalid format" }); return; }
  }

  const result = await checkWithFallback(mode, line, proxyUrl);
  res.json(result);
});

export default router;
