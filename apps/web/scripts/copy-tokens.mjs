import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const logos = resolve(root, "vendor/base/logos");
const pub = resolve(here, "../public");

const copies = [
  [resolve(root, "ui/tokens.css"), resolve(here, "../src/generated/tokens.css")],
  [`${logos}/rollin-favicon.svg`, `${pub}/favicon.svg`],
  [`${logos}/rollin-favicon-32.png`, `${pub}/icons/favicon-32.png`],
  [`${logos}/rollin-apple-touch-icon.png`, `${pub}/icons/apple-touch-icon.png`],
  [`${logos}/rollin-icon-192.png`, `${pub}/icons/icon-192.png`],
  [`${logos}/rollin-icon-512.png`, `${pub}/icons/icon-512.png`],
  [`${logos}/rollin-icon-maskable-512.png`, `${pub}/icons/icon-maskable-512.png`],
  [`${logos}/rollin-wordmark-dark.svg`, `${pub}/rollin-wordmark-dark.svg`],
  [`${logos}/rollin-wordmark-light.svg`, `${pub}/rollin-wordmark-light.svg`],
];
for (const [from, to] of copies) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log(`copied ${copies.length} assets from ui/ and vendor/base`);
