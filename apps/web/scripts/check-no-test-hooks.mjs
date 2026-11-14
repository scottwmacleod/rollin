// Fails the build if the test-only dice hook reached the production bundle
// (it is dropped at build time unless the mode is "e2e"; see src/dice.ts).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const files = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter((f) =>
  /\.(js|html)$/.test(f),
);
const leaked = files.filter((f) => readFileSync(join(dist, f), "utf8").includes("__rollinDice"));
if (leaked.length > 0) {
  console.error(`test hook __rollinDice found in the production build: ${leaked.join(", ")}`);
  process.exit(1);
}
console.log(`no test hooks in ${files.length} production files`);
