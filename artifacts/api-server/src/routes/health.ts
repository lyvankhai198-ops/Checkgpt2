import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Public endpoint — bot polls this to check maintenance mode */
router.get("/system/status", async (_req, res) => {
  try {
    const [s] = await db.select({ maintenanceMode: settingsTable.maintenanceMode })
      .from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);
    res.json({ maintenanceMode: (s?.maintenanceMode ?? 0) === 1 });
  } catch {
    res.json({ maintenanceMode: false });
  }
});

export default router;
