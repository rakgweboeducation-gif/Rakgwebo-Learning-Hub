import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { api } from "@shared/routes";
import multer from "multer";
import path from "path";
import fs from "fs";
import { setupSessionWebSocket } from "./session-ws";
import { setupClassWebSocket } from "./class-ws";

// ✅ FIX: single clean import (NO duplicates)
import {
  insertTextbookSchema,
  insertAnnotationSchema,
  insertHelpRequestSchema,
  insertTutorSessionSchema,
  insertSessionRecordingSchema,
} from "@shared/schema";

// ==========================
// HELPERS
// ==========================
function stripPassword(user: any) {
  if (!user) return user;
  const { password, ...safe } = user;
  return safe;
}

function stripPasswordsFromList(users: any[]) {
  return users.map(stripPassword);
}

// ✅ SAFE logActivity (won’t crash if not implemented)
function logActivity(req: any, action: string, details?: string) {
  try {
    const user = req.user;

    if (!storage || typeof (storage as any).logActivity !== "function") return;

    (storage as any)
      .logActivity({
        userId: user?.id || null,
        userName: user?.username || user?.name || null,
        userRole: user?.role || null,
        action,
        details: details || null,
        ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString() || null,
      })
      .catch(() => {});
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}

// ==========================
// FILE UPLOAD SETUP
// ==========================
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ==========================
// MAIN ROUTES
// ==========================
export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // AUTH
  setupAuth(app);

  // WEBSOCKETS
  try {
    const sessionWss = setupSessionWebSocket(httpServer);
    const classWss = setupClassWebSocket(httpServer);

    httpServer.on("upgrade", (req, socket, head) => {
      const url = req.url?.split("?")[0];

      if (url === "/ws/session") {
        sessionWss.handleUpgrade(req, socket as any, head, (ws) => {
          sessionWss.emit("connection", ws, req);
        });
      } else if (url === "/ws/class") {
        classWss.handleUpgrade(req, socket as any, head, (ws) => {
          classWss.emit("connection", ws, req);
        });
      } else {
        socket.destroy();
      }
    });
  } catch (err) {
    console.error("⚠️ WebSocket setup failed:", err);
  }

  // ==========================
  // BASIC HEALTH CHECK (VERY IMPORTANT)
  // ==========================
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ==========================
  // USERS (SAFE EXAMPLE ROUTE)
  // ==========================
  app.get("/api/users/me", async (req: any, res) => {
    if (!req.isAuthenticated?.()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await storage.getUser(req.user.id);
    res.json(stripPassword(user));
  });

  // ==========================
  // FILE UPLOAD TEST
  // ==========================
  app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    res.json({
      url: `/uploads/${req.file.filename}`,
    });
  });

  // ==========================
  // STATIC UPLOADS
  // ==========================
  app.use("/uploads", express.static(uploadDir));

  // ==========================
  // FINAL RETURN
  // ==========================
  return httpServer;
}
