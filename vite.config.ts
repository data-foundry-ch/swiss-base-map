import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Serve / pack the versioned asset package (swiss-basemap-assets)
  publicDir: "assets",
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: "es2022",
  },
});
