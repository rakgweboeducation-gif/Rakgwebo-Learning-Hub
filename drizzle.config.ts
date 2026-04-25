import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import path from "path";

// Load .env from root directory explicitly
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL is not set in .env");
}

export default defineConfig({
  // Make path explicit and safe
  schema: path.resolve(process.cwd(), "shared/schema.ts"),

  out: "./drizzle",

  dialect: "postgresql",

  dbCredentials: {
    url: process.env.DATABASE_URL,
  },

  verbose: true,
  strict: true,
});
