import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { seedDatabase } from "./seed";

// 🔥 Crash handlers (so nothing is silent anymore)
process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION:", err);
});

const app = express();
const server = createServer(app);

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔥 START SERVER IMMEDIATELY (CRITICAL)
const PORT = parseInt(process.env.PORT || "10000", 10);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// 🔥 Run everything AFTER server starts
(async () => {
  try {
    console.log("Starting setup...");

    // Database seed (safe)
    try {
      await seedDatabase();
      console.log("✅ Database ready");
    } catch (err) {
      console.error("⚠️ Seed skipped:", err);
    }

    // Routes
    try {
      await registerRoutes(server, app);
      console.log("✅ Routes loaded");
    } catch (err) {
      console.error("❌ Routes failed:", err);
    }

    // Static files
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
      console.log("✅ Static serving enabled");
    }
  } catch (err) {
    console.error("💥 Startup failure:", err);
  }
})();
