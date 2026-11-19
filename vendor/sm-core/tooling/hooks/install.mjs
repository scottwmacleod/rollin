// Points git at the sm_ hooks in this folder (core.hooksPath).
//
//   "prepare": "node vendor/sm-core/tooling/hooks/install.mjs"
//
// Skips quietly in CI, outside a git checkout, and when hooksPath is already
// set to something else (it says so instead of overwriting it). No dependencies.
import { execFileSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CI) process.exit(0);

const here = dirname(fileURLToPath(import.meta.url));
const git = (...args) =>
  execFileSync("git", args, { cwd: here, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

let root;
try {
  root = git("rev-parse", "--show-toplevel");
} catch {
  process.exit(0); // not a git checkout (e.g. a deploy build)
}

const want = relative(root, here).split("\\").join("/");
let current = "";
try {
  current = git("config", "--get", "core.hooksPath");
} catch {}
if (current && current !== want) {
  console.warn(`sm_ hooks not installed: core.hooksPath is already "${current}".`);
  process.exit(0);
}
chmodSync(join(here, "pre-push"), 0o755); // copies can lose the executable bit
if (current !== want) git("config", "core.hooksPath", want);
console.log(`sm_ hooks installed (core.hooksPath = ${want})`);
