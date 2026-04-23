import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Only load dev plugins safely
const devPlugins =
  process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
    ? [
        require("@replit/vite-plugin-cartographer").cartographer(),
        require("@replit/vite-plugin-dev-banner").devBanner(),
      ]
    : [];

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...devPlugins,
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // ✅ FIXED
      "@shared": path.resolve(__dirname, "../shared"),
      "@assets": path.resolve(__dirname, "../attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});