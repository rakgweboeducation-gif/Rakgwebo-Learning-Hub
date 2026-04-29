import express from "express";
import path from "path";
import fs from "fs";

export function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  console.log("📦 Serving static from:", distPath);

  // 🔍 DEBUG: check if index.html exists
  const indexPath = path.join(distPath, "index.html");
  console.log("🔍 index.html exists:", fs.existsSync(indexPath));

  app.use(express.static(distPath));

  // 🔥 FORCE ROOT TO WORK
  app.get("/", (req, res) => {
    res.sendFile(indexPath);
  });

  // 🔥 SPA fallback
  app.use((req, res) => {
    res.sendFile(indexPath);
  });
}
