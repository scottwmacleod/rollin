// Copies the generated design tokens into the front-end source tree at build
// time so ui/tokens.css stays the single source of truth (never hand-edit
// src/generated/tokens.css; it is gitignored).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, "../../../ui/tokens.css");
const to = resolve(here, "../src/generated/tokens.css");
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log(`copied ${from} -> ${to}`);
