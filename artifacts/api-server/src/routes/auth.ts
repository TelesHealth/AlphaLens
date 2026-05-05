import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { hashPassword, verifyPassword, generateToken } from "../services/auth";
import { requireAuth, TOKEN_COOKIE_NAME } from "../middlewares/auth";

const router: IRouter = Router();

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res: any, token: string) {
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: SEVEN_DAYS_MS,
    path: "/",
  });
}

router.post("/register", async (req, res) => {
  try {
    const body = RegisterBody.parse(req.body);
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, body.email.toLowerCase()))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const passwordHash = await hashPassword(body.password);
    const [user] = await db
      .insert(usersTable)
      .values({
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name,
        role: "user",
      })
      .returning();
    const token = generateToken(user.id, user.email, user.role);
    setAuthCookie(res, token);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      message: "Account created",
    });
  } catch (e: any) {
    if (e?.issues) {
      res.status(400).json({ error: e.issues[0]?.message ?? "Invalid input" });
      return;
    }
    req.log.error({ err: e }, "register failed");
    res.status(500).json({ error: e.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const body = LoginBody.parse(req.body);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, body.email.toLowerCase()))
      .limit(1);
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));
    const token = generateToken(user.id, user.email, user.role);
    setAuthCookie(res, token);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (e: any) {
    if (e?.issues) {
      res.status(400).json({ error: e.issues[0]?.message ?? "Invalid input" });
      return;
    }
    req.log.error({ err: e }, "login failed");
    res.status(500).json({ error: e.message });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie(TOKEN_COOKIE_NAME, { path: "/" });
  res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (e: any) {
    req.log.error({ err: e }, "me failed");
    res.status(500).json({ error: e.message });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const body = ChangePasswordBody.parse(req.body);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const ok = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
    const newHash = await hashPassword(body.newPassword);
    await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));
    res.json({ message: "Password updated" });
  } catch (e: any) {
    if (e?.issues) {
      res.status(400).json({ error: e.issues[0]?.message ?? "Invalid input" });
      return;
    }
    req.log.error({ err: e }, "change-password failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
