import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkerRouter from "./checker";
import githubRouter from "./github";
import adminRouter from "./admin";
import keysRouter from "./keys";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkerRouter);
router.use(githubRouter);
router.use(adminRouter);
router.use(keysRouter);

export default router;
