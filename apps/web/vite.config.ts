import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { offlineWorker } from "./scripts/pwa.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), offlineWorker()],
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
