import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketsRouter from "./markets";
import signalsRouter from "./signals";
import portfolioRouter from "./portfolio";
import coachRouter from "./coach";
import recommendationsRouter from "./recommendations";
import tradingRouter from "./trading";
import radarRouter from "./radar";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/markets", marketsRouter);
router.use("/signals", signalsRouter);
router.use("/portfolio", portfolioRouter);
router.use("/coach", coachRouter);
router.use("/recommendations", recommendationsRouter);
router.use("/trading", tradingRouter);
router.use("/radar", radarRouter);

export default router;
