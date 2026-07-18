import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Dev proxy: the Fastify server owns /api, /auth and the scan trigger.
const backend = "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    proxy: {
      "/api": backend,
      "/auth": backend,
      "/run-daily-scan": backend,
    },
  },
});
