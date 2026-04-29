import express from "express";
import path from "path";

export function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  console.log("📦 Serving static from:", distPath);

  // Serve static assets
  app.use(express.static(distPath));

  // ✅ Express 5 SAFE fallback (NO "*", NO "/*")
  app.use((req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
