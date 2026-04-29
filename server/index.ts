import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { seedDatabase } from "./seed";

// 🔥 Crash handlers
process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION:", err);
});

const app = express();
const server = createServer(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = parseInt(process.env.PORT || "10000", 10);

// 🔥 START SERVER IMMEDIATELY (IMPORTANT for Render)
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// 🔥 Run setup AFTER server starts
(async () => {
  try {
    console.log("🚀 Starting server setup...");

    // ✅ Seed DB (non-blocking)
    try {
      await seedDatabase();
      console.log("✅ Database ready");
    } catch (err) {
      console.error("⚠️ Seed skipped:", err);
    }

    // ✅ Register routes
    try {
      await registerRoutes(server, app);
      console.log("✅ Routes loaded");
    } catch (err) {
      console.error("❌ Routes failed:", err);
    }

    // ✅ Serve frontend LAST (CRITICAL)
    try {
      serveStatic(app);
      console.log("✅ Static serving enabled");
    } catch (err) {
      console.error("❌ Static failed:", err);
    }
  } catch (err) {
    console.error("💥 Startup failure:", err);
  }
})();
