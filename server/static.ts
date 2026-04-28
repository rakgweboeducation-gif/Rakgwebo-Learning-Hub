import path from "path";
import { fileURLToPath } from "url";
import express, { type Express } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function serveStatic(app: Express) {
  // 🔥 FIX: correct path to Vite build output
  const distPath = path.resolve(process.cwd(), "client", "dist");

  console.log("📦 Serving static files from:", distPath);

  app.use(express.static(distPath));

  // SPA fallback
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
