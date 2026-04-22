import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { userTradingAccountsTable } from "@workspace/db/schema";
import { encryptCredentials } from "../services/auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const SUPPORTED_PLATFORMS = ["kalshi", "alpaca", "polymarket"] as const;
type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

const credentialSchemas: Record<SupportedPlatform, z.ZodTypeAny> = {
  kalshi: z.object({ email: z.string().email(), password: z.string().min(1) }),
  alpaca: z.object({ apiKey: z.string().min(1), secretKey: z.string().min(1) }),
  polymarket: z.object({ privateKey: z.string().min(1) }),
};

const SaveBody = z.object({
  platform: z.enum(SUPPORTED_PLATFORMS),
  credentials: z.record(z.string(), z.unknown()),
});

router.get("/trading-accounts", requireAuth, async (req, res) => {
  try {
    const accounts = await db
      .select({
        id: userTradingAccountsTable.id,
        platform: userTradingAccountsTable.platform,
        status: userTradingAccountsTable.status,
        createdAt: userTradingAccountsTable.createdAt,
      })
      .from(userTradingAccountsTable)
      .where(eq(userTradingAccountsTable.userId, req.user!.userId));
    res.json({ accounts });
  } catch (e: any) {
    req.log.error({ err: e }, "list trading accounts failed");
    res.status(500).json({ error: e.message });
  }
});

router.post("/trading-accounts", requireAuth, async (req, res) => {
  try {
    const body = SaveBody.parse(req.body);
    const platform = body.platform as SupportedPlatform;
    const parsed = credentialSchemas[platform].safeParse(body.credentials);
    if (!parsed.success) {
      res.status(400).json({ error: `Invalid credentials for ${platform}` });
      return;
    }
    const encrypted = encryptCredentials(parsed.data as Record<string, unknown>);
    const userId = req.user!.userId;
    const existing = await db
      .select({ id: userTradingAccountsTable.id })
      .from(userTradingAccountsTable)
      .where(
        and(
          eq(userTradingAccountsTable.userId, userId),
          eq(userTradingAccountsTable.platform, platform),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await db
        .update(userTradingAccountsTable)
        .set({
          encryptedCredentials: encrypted,
          status: "configured",
          updatedAt: new Date(),
        })
        .where(eq(userTradingAccountsTable.id, existing[0].id));
    } else {
      await db.insert(userTradingAccountsTable).values({
        userId,
        platform,
        encryptedCredentials: encrypted,
        status: "configured",
      });
    }
    res.json({ message: "Credentials saved", platform, status: "configured" });
  } catch (e: any) {
    if (e?.issues) {
      res.status(400).json({ error: e.issues[0]?.message ?? "Invalid input" });
      return;
    }
    req.log.error({ err: e }, "save trading account failed");
    res.status(500).json({ error: e.message });
  }
});

router.delete("/trading-accounts/:platform", requireAuth, async (req, res) => {
  try {
    const platform = String(req.params.platform);
    if (!SUPPORTED_PLATFORMS.includes(platform as SupportedPlatform)) {
      res.status(400).json({ error: "Unsupported platform" });
      return;
    }
    await db
      .delete(userTradingAccountsTable)
      .where(
        and(
          eq(userTradingAccountsTable.userId, req.user!.userId),
          eq(userTradingAccountsTable.platform, platform),
        ),
      );
    res.json({ message: "Credentials removed" });
  } catch (e: any) {
    req.log.error({ err: e }, "delete trading account failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
