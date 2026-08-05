import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkerRouter from "./checker";
import githubRouter from "./github";
import adminRouter from "./admin";
import keysRouter from "./keys";
import paymentRouter from "./payment";
import plansRouter from "./plans";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkerRouter);
router.use(githubRouter);
router.use(adminRouter);
router.use(keysRouter);
router.use(paymentRouter);
router.use(plansRouter);

export default router;
