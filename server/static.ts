import path from "path";
import { fileURLToPath } from "url";
import express, { type Express } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function serveStatic(app: Express) {
  // Go up to project root, then into dist
  const distPath = path.resolve(__dirname, "../dist");

  app.use(express.static(distPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
