import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// One-time: ensure users.language has no DB-level default (old schema had default 'vi')
// This is idempotent — safe to run on every startup.
try {
  await db.execute(sql`ALTER TABLE users ALTER COLUMN language DROP DEFAULT`);
  logger.info("Dropped default from users.language (if any)");
} catch {
  // Column already had no default — ignore
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
