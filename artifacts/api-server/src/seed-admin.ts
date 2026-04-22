import { eq } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { hashPassword } from "./services/auth";

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME;

  if (!email || !password || !name) {
    console.error("ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME environment variables are required");
    process.exit(1);
  }

  const existing = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  const passwordHash = await hashPassword(password);

  if (existing.length > 0) {
    const [user] = await db
      .update(usersTable)
      .set({ passwordHash, name, role: "admin", isActive: true })
      .where(eq(usersTable.id, existing[0].id))
      .returning({ id: usersTable.id, email: usersTable.email });
    console.log(`Admin account updated: ${user.email}`);
    await pool.end();
    process.exit(0);
  }

  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name, role: "admin" })
    .returning({ id: usersTable.id, email: usersTable.email });

  console.log(`Admin account created: ${user.email}`);
  await pool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("Failed to create admin account:", e?.message ?? e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
