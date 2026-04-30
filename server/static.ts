import express from "express";
import path from "path";

export function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  console.log("📦 Serving static from:", distPath);

  app.use(express.static(distPath));

  // SPA fallback
  app.use((req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
