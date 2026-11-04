/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Tauri expects a fixed dev port and serves `dist` in production.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
  build: { target: "safari15", assetsInlineLimit: 0 },
});
