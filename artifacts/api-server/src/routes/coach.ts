import { Router, type IRouter } from "express";
import { CoachAnalyzeBody, CoachAnalyzeResponse } from "@workspace/api-zod";
import { getCoachAnalysis } from "../services/coach";

const router: IRouter = Router();

router.post("/analyze", async (req, res) => {
  try {
    const body = CoachAnalyzeBody.parse(req.body);
    const result = await getCoachAnalysis(body);
    const data = CoachAnalyzeResponse.parse(result);
    res.json(data);
  } catch (e: any) {
    req.log.error({ err: e }, "Error in coach analysis");
    res.status(500).json({ error: e.message });
  }
});

export default router;
