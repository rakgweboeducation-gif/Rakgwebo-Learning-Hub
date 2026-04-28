import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";

// ==========================
// 🔥 GLOBAL CRASH HANDLERS
// ==========================
process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION:", err);
});

// ==========================
const app = express();
const httpServer = createServer(app);

// Extend request type
declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ==========================
// BODY PARSING
// ==========================
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// ==========================
// CACHE CONTROL
// ==========================
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }

  if (
    req.path.endsWith(".html") ||
    req.path === "/" ||
    !req.path.includes(".")
  ) {
    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }

  next();
});

// ==========================
// LOGGER
// ==========================
export function log(message: string, source = "app") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// ==========================
// REQUEST LOGGER
// ==========================
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  let capturedJsonResponse: Record<string, any> | undefined;

  const originalJson = res.json;
  res.json = function (body: any, ...args: any[]) {
    capturedJsonResponse = body;
    return originalJson.apply(res, [body, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;

    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine, "api");
    }
  });

  next();
});

// ==========================
// START SERVER FUNCTION
// ==========================
async function startServer() {
  log("🚀 Starting server...", "startup");

  // --------------------------
  // DATABASE SEED (SAFE)
  // --------------------------
  try {
    await seedDatabase();
    log("✅ Database seeded", "startup");
  } catch (err: any) {
    console.error("💥 SEED CRASH:", err);
    log("Skipping seed (database not ready)", "startup");
  }

  // --------------------------
  // ROUTES (SAFE)
  // --------------------------
  try {
    await registerRoutes(httpServer, app);
    log("✅ Routes registered", "startup");
  } catch (err: any) {
    console.error("💥 ROUTES FAILED:", err);
  }

  // --------------------------
  // ERROR HANDLER
  // --------------------------
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("❌ Express Error:", err);

    if (res.headersSent) return next(err);

    res.status(status).json({ message });
  });

  // --------------------------
  // STATIC / DEV
  // --------------------------
  try {
    if (process.env.NODE_ENV === "production") {
      log("📦 Serving static files...", "startup");
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
      log("⚡ Vite dev server ready", "startup");
    }
  } catch (err) {
    console.error("💥 STATIC/VITE FAILED:", err);
  }

  // --------------------------
  // START LISTENING
  // --------------------------
  const port = parseInt(process.env.PORT || "5000", 10);

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`🚀 Server running on port ${port}`, "startup");
    },
  );
}

// ==========================
// RUN SERVER
// ==========================
startServer().catch((err) => {
  console.error("💥 STARTUP FAILED:", err);
});
