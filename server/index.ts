import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";

// 🔥 GLOBAL CRASH HANDLERS (CRITICAL)
process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION:", err);
});

const app = express();
const httpServer = createServer(app);

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
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
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
// STARTUP
// ==========================
(async () => {
  try {
    log("Starting server...", "startup");

    // SAFE SEED
    try {
      await seedDatabase();
      log("Database seeded successfully", "startup");
    } catch (err: any) {
      console.error("❌ Seed failed:", err);
      log("Skipping seed (non-critical)", "startup");
    }

    // SAFE ROUTES
    try {
      await registerRoutes(httpServer, app);
      log("Routes registered successfully", "startup");
    } catch (err: any) {
      console.error("❌ ROUTES FAILED:", err);
    }

    // ERROR HANDLER
    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("❌ Internal Server Error:", err);

      if (res.headersSent) {
        return next(err);
      }

      return res.status(status).json({ message });
    });

    // STATIC / DEV
    if (process.env.NODE_ENV === "production") {
      log("Serving static files...", "startup");
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
      log("Vite dev server started", "startup");
    }

    // START SERVER
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
  } catch (err) {
    console.error("💥 STARTUP FAILED:", err);
  }
})();
