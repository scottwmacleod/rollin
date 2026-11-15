// Regenerates the PWA icons in public/icons from the rollin mark (the same
// glyph as public/favicon.svg). Not part of the build: the PNGs are committed.
// Run with `node scripts/make-icons.mjs` after `npx playwright install chromium`.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
mkdirSync(out, { recursive: true });

const glyph = `<g transform="translate(159.7 704.5) scale(0.71821)"><path fill="#EDEFEA" d="M66 0V-536H208L212 -429Q228 -485 259.0 -510.5Q290 -536 339 -536H388V-412H339Q276 -412 246.0 -386.5Q216 -361 216 -301V0Z"/><rect fill="#C5F04A" x="415" y="-190" width="500" height="190"/></g>`;
// "any": rounded tile with transparent corners. "full": edge to edge, for
// maskable icons (the glyph sits inside the 80% safe zone) and iOS.
const any = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 100 824 824"><rect x="100" y="100" width="824" height="824" rx="185" fill="#0B0C0B"/>${glyph}</svg>`;
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#0B0C0B"/>${glyph}</svg>`;

const icons = [
  ["icon-192.png", any, 192],
  ["icon-512.png", any, 512],
  ["icon-maskable-512.png", full, 512],
  ["apple-touch-icon.png", full, 180],
];

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH
    ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] }
    : {},
);
for (const [name, svg, size] of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: resolve(out, name), omitBackground: true });
  await page.close();
}
await browser.close();
console.log(`wrote ${icons.length} icons to ${out}`);
