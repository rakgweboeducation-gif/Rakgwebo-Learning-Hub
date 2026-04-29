import express from "express";
import path from "path";

export function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  console.log("📦 Serving static from:", distPath);

  // Serve static files
  app.use(express.static(distPath));

  // FIXED: Express 5 wildcard route
  app.get("/*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
