import express from "express";
import path from "path";

export function serveStatic(app: express.Express) {
  // ✅ Correct Vite build output
  const distPath = path.resolve(process.cwd(), "dist");

  console.log("📦 Serving static from:", distPath);

  // Serve static files
  app.use(express.static(distPath));

  // ✅ Express 5 safe fallback (NO "*", NO "/*")
  app.use((req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
