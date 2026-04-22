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

  if (existing.length > 0) {
    console.log(`Admin account already exists: ${existing[0].email}`);
    await pool.end();
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);
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
