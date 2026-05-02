export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "client"),

  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },

  base: "/", // ✅ ADD THIS (IMPORTANT)
});
