import express from "express";
import path from "path";
import { fileURLToPath } from "url";

export function serveStatic(app: express.Express) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const distPath = path.join(__dirname, "../dist/public");

  console.log("📦 Serving static from:", distPath);

  // Serve static assets
  app.use(express.static(distPath));

  // Catch-all → return index.html (THIS FIXES YOUR ISSUE)
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
