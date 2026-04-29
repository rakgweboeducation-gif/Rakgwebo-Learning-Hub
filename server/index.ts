import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { seedDatabase } from "./seed";

process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION:", err);
});

const app = express();
const server = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = parseInt(process.env.PORT || "10000", 10);

(async () => {
  try {
    console.log("🚀 Starting server setup...");

    // ✅ Serve frontend FIRST (CRITICAL)
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
      console.log("✅ Static serving enabled");
    }

    // ✅ THEN routes
    await registerRoutes(server, app);
    console.log("✅ Routes loaded");

    // ✅ THEN DB (optional order, safer last)
    try {
      await seedDatabase();
      console.log("✅ Database ready");
    } catch (err) {
      console.error("⚠️ Seed skipped:", err);
    }

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("💥 Startup failure:", err);
  }
})();
