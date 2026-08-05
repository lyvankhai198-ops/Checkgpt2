import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkerRouter from "./checker";
import githubRouter from "./github";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkerRouter);
router.use(githubRouter);

export default router;
