import path from "path";
import express, { type Express } from "express";

export function serveStatic(app: Express) {
  // Correct path to Vite build output
  const distPath = path.join(process.cwd(), "client", "dist");

  app.use(express.static(distPath));

  // SPA fallback (React routing)
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
