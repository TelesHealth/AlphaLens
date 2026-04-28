import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketsRouter from "./markets";
import signalsRouter from "./signals";
import portfolioRouter from "./portfolio";
import coachRouter from "./coach";
import recommendationsRouter from "./recommendations";
import tradingRouter from "./trading";
import radarRouter from "./radar";
import uwRouter from "./unusual-whales";
import authRouter from "./auth";
import tradingCredentialsRouter from "./trading-credentials";
import leaderboardRouter from "./leaderboard";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/leaderboard", leaderboardRouter);

// Protected — all other API routes require a valid session
router.use("/markets", requireAuth, marketsRouter);
router.use("/signals", requireAuth, signalsRouter);
router.use("/portfolio", requireAuth, portfolioRouter);
router.use("/coach", requireAuth, coachRouter);
router.use("/recommendations", requireAuth, recommendationsRouter);
router.use("/trading", requireAuth, tradingRouter);
router.use("/radar", requireAuth, radarRouter);
router.use("/whales", requireAuth, uwRouter);
router.use("/user", requireAuth, tradingCredentialsRouter);

export default router;
