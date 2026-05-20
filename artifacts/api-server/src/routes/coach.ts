import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { CoachAnalyzeBody, CoachAnalyzeResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { coachMessagesTable } from "@workspace/db/schema";
import { getCoachAnalysis } from "../services/coach";
import { optionalAuth, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

type SerializedMessage = {
  id: number;
  role: "user" | "coach";
  content: string;
  recommendations: string[] | null;
  riskAssessment: string | null;
  confidence: number | null;
  createdAt: string;
};

function serialize(row: typeof coachMessagesTable.$inferSelect): SerializedMessage {
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "coach",
    content: row.content,
    recommendations: Array.isArray(row.recommendations)
      ? row.recommendations
      : null,
    riskAssessment: row.riskAssessment ?? null,
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// POST /analyze — runs the AI coach. When the caller is authenticated, both
// the user's question and the coach reply are persisted to coach_messages so
// the chat survives logout/login (P3-15). Anonymous callers still get an
// answer; their messages just aren't saved server-side.
router.post("/analyze", optionalAuth, async (req, res) => {
  try {
    const body = CoachAnalyzeBody.parse(req.body);
    const userId = req.user?.userId;
    const askedAt = new Date();

    const result = await getCoachAnalysis(body);
    const data = CoachAnalyzeResponse.parse(result);

    if (typeof userId === "number") {
      try {
        await db.insert(coachMessagesTable).values([
          {
            userId,
            role: "user",
            content: body.question,
            createdAt: askedAt,
          },
          {
            userId,
            role: "coach",
            content: data.analysis,
            recommendations: data.recommendations ?? null,
            riskAssessment: data.riskAssessment ?? null,
            confidence:
              typeof data.confidence === "number" ? data.confidence : null,
          },
        ]);
      } catch (persistErr: any) {
        // Persistence failure must NOT break the user-facing answer — the
        // coach response is already computed. Log loudly so we can debug.
        req.log.error(
          { err: persistErr?.message ?? persistErr, userId },
          "Failed to persist coach messages",
        );
      }
    }

    res.json(data);
  } catch (e: any) {
    req.log.error({ err: e }, "Error in coach analysis");
    res.status(500).json({ error: e.message });
  }
});

// GET /messages — list the authenticated user's chat history.
// Returns the most recent MAX_HISTORY messages in chronological order
// (oldest first) so the client can render the thread top-to-bottom. We cap
// the result to keep payloads bounded for power users who never clear their
// history.
const MAX_HISTORY = 500;
router.get("/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    // Fetch the newest MAX_HISTORY rows, then reverse client-side so the
    // wire format stays chronological. Doing the slice in SQL is cheaper
    // than transferring an unbounded history.
    const newest = await db
      .select()
      .from(coachMessagesTable)
      .where(eq(coachMessagesTable.userId, userId))
      .orderBy(desc(coachMessagesTable.createdAt))
      .limit(MAX_HISTORY);
    const chronological = [...newest].reverse();
    // Note: asc() is still imported for any future readers wanting a
    // straight ascending query; the desc + reverse() approach is preferred
    // here because it lets the SQL LIMIT pick the *most recent* window.
    void asc;
    res.json({ messages: chronological.map(serialize) });
  } catch (e: any) {
    req.log.error({ err: e }, "Failed to list coach messages");
    res.status(500).json({ error: e.message });
  }
});

// DELETE /messages — wipe the authenticated user's chat history.
router.delete("/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const deleted = await db
      .delete(coachMessagesTable)
      .where(and(eq(coachMessagesTable.userId, userId)))
      .returning({ id: coachMessagesTable.id });
    res.json({ cleared: deleted.length });
  } catch (e: any) {
    req.log.error({ err: e }, "Failed to clear coach messages");
    res.status(500).json({ error: e.message });
  }
});

export default router;
