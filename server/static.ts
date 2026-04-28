import path from "path";
import express, { type Express } from "express";
import fs from "fs";

export function serveStatic(app: Express) {
  // ✅ Correct path based on your Vite build output
  const distPath = path.resolve(process.cwd(), "dist", "public");

  console.log("📦 Serving static files from:", distPath);

  // 🔥 Prevent silent crash if folder missing
  if (!fs.existsSync(distPath)) {
    console.error("❌ Static build folder NOT FOUND:", distPath);
    throw new Error("Missing dist/public. Did the build run?");
  }

  // Serve static assets
  app.use(express.static(distPath));

  // SPA fallback (React router, etc.)
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
