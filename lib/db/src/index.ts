import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
   connectionString: process.env.DATABASE_URL,
   ssl: process.env.NODE_ENV === 'production'
     ? { rejectUnauthorized: false }
     : false
 });

console.log("DEBUG: DATABASE_URL starts with:", process.env.DATABASE_URL?.substring(0, 10));

export const db = drizzle(pool);


