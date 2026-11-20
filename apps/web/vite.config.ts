import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { offlineWorker } from "./scripts/pwa.ts";

// The build's commit on Vercel, so an error report says which deploy it came from.
const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

// Preload the Geist file so text paints in Geist without waiting for the CSS to
// name it. The file name carries a content hash, so this runs after the build.
function preloadGeist(): Plugin {
  return {
    name: "rollin-preload-geist",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, { bundle }) {
        const font = Object.values(bundle ?? {}).find((file) =>
          /^assets\/geist-latin-wght-normal-[\w-]+\.woff2$/.test(file.fileName),
        );
        if (!font) throw new Error("preloadGeist: the Geist Latin font is missing from the build");
        return [
          {
            tag: "link",
            attrs: {
              rel: "preload",
              href: `/${font.fileName}`,
              as: "font",
              type: "font/woff2",
              crossorigin: "",
            },
            injectTo: "head",
          },
        ];
      },
    },
  };
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Public source maps (the repo is public), so PostHog shows readable stack traces. The offline worker skips .map files.
  build: { sourcemap: true },
  plugins: [react(), tailwindcss(), offlineWorker(), preloadGeist()],
  test: { include: ["src/**/*.test.{ts,tsx}"], sequence: { shuffle: true } },
});
