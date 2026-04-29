import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";

// 🔥 CRASH HANDLERS (VERY IMPORTANT)
process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION:", err);
});

const app = express();
const httpServer = createServer(app);

// BODY PARSING
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// SIMPLE LOGGER
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ==========================
// START SERVER FIRST (CRITICAL FIX)
// ==========================
const port = parseInt(process.env.PORT || "10000", 10);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${port}`);
});

// ==========================
// INIT APP AFTER START
// ==========================
(async () => {
  try {
    console.log("Starting app setup...");

    // Seed (non-blocking)
    try {
      await seedDatabase();
      console.log("Database seeded");
    } catch (err) {
      console.error("Seed skipped:", err);
    }

    // Routes
    try {
      await registerRoutes(httpServer, app);
      console.log("Routes registered");
    } catch (err) {
      console.error("Routes failed:", err);
    }

    // Static
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    }
  } catch (err) {
    console.error("Startup error:", err);
  }
})();

// ERROR HANDLER
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: "Internal Server Error" });
});
