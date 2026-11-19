import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { offlineWorker } from "./scripts/pwa.ts";

// The build's commit on Vercel, so an error report says which deploy it came from.
const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Public source maps (the repo is public), so PostHog shows readable stack traces. The offline worker skips .map files.
  build: { sourcemap: true },
  plugins: [react(), tailwindcss(), offlineWorker()],
  test: { include: ["src/**/*.test.{ts,tsx}"], sequence: { shuffle: true } },
});
