import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketsRouter from "./markets";
import signalsRouter from "./signals";
import portfolioRouter from "./portfolio";
import coachRouter from "./coach";
import recommendationsRouter from "./recommendations";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/markets", marketsRouter);
router.use("/signals", signalsRouter);
router.use("/portfolio", portfolioRouter);
router.use("/coach", coachRouter);
router.use("/recommendations", recommendationsRouter);

export default router;
