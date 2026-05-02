import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// ✅ Detect production (Render) vs local
const isProduction = process.env.NODE_ENV === "production";

// ✅ Create pool with SSL in production
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction
    ? {
        rejectUnauthorized: false,
      }
    : false,
});

// Optional: log connection (helps debugging)
pool.on("connect", () => {
  console.log("✅ Connected to database");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected DB error:", err);
});

export const db = drizzle(pool, { schema });
