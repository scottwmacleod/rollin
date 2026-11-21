import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { offlineWorker } from "./scripts/pwa.ts";

const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

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
  build: { sourcemap: true },
  plugins: [react(), tailwindcss(), offlineWorker(), preloadGeist()],
  test: { include: ["src/**/*.test.{ts,tsx}"], sequence: { shuffle: true } },
});
