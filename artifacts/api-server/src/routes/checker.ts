import { Router } from "express";
import type { IRouter } from "express";
import { checkAccount, checkSessionToken } from "../lib/checker.js";
import { CheckAccountsBody, CheckSingleBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/check", async (req, res): Promise<void> => {
  const parsed = CheckAccountsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { mode, rawText, concurrency = 3 } = parsed.data;
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    res.status(400).json({ error: "no input" });
    return;
  }

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

  let completed = 0;
  const sem = concurrency;
  let running = 0;
  let idx = 0;

  await new Promise<void>((resolve) => {
    const tryNext = () => {
      while (running < sem && idx < lines.length) {
        const i = idx++;
        const line = lines[i];
        running++;

        (async () => {
          let result;
          if (mode === "account") {
            const parts = line.split("|").map((p) => p.trim());
            if (parts.length >= 3) {
              result = await checkAccount(parts[0], parts[1], parts[2]);
            } else if (parts.length === 2) {
              result = await checkAccount(parts[0], parts[1], "");
            } else {
              result = {
                input: line.slice(0, 50),
                email: null,
                status: "error" as const,
                user: null,
                plan: null,
                error: "invalid format (need email|pass or email|pass|2fa)",
              };
            }
          } else {
            result = await checkSessionToken(line);
          }

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

  const liveCount = 0; // client counts from results
  const dieCount = 0;
  send({ type: "done", total: lines.length, live: liveCount, die: dieCount });
  res.end();
});

router.post("/check-single", async (req, res): Promise<void> => {
  const parsed = CheckSingleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { mode, rawText } = parsed.data;
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    res.status(400).json({ error: "no input" });
    return;
  }

  const line = lines[0];
  let result;
  if (mode === "account") {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length >= 3) {
      result = await checkAccount(parts[0], parts[1], parts[2]);
    } else if (parts.length === 2) {
      result = await checkAccount(parts[0], parts[1], "");
    } else {
      res.status(400).json({ error: "invalid format" });
      return;
    }
  } else {
    result = await checkSessionToken(line);
  }

  res.json(result);
});

export default router;
