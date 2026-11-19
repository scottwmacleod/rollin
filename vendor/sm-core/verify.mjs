// Verifies a synced copy of sm-core against its manifest.
//
//   node vendor/sm-core/verify.mjs
//
// Fails if any file in the copy was edited, added or removed, or if a shared
// file installed in the product (GitHub templates, docs/agents/*) no longer
// matches the copy. Text below the PR template's `<!-- product -->` line is
// the product's own and isn't checked. To change any of it, change sm-core,
// cut a release and sync it again; never edit the copy. No dependencies.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "<!-- product -->";
// The marker counts only on a line of its own.
const markerAt = (text) => text.search(/^<!-- product -->$/m);
const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const problems = [];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(here, p).split("\\").join("/")];
  });
}

const present = new Set(walk(here).filter((f) => f !== "manifest.json" && f !== "verify.mjs"));
for (const [file, hash] of Object.entries(manifest.files)) {
  if (!present.has(file)) {
    problems.push(`missing ${file}`);
    continue;
  }
  present.delete(file);
  const got = createHash("sha256").update(readFileSync(join(here, file))).digest("hex");
  if (got !== hash) problems.push(`edited ${file}`);
}
for (const file of present) problems.push(`unexpected ${file}`);

// Shared files installed in the product must match the (verified) copy.
const productRoot = resolve(here, manifest.root ?? "../..");
const shared = (text) => (markerAt(text) === -1 ? text : text.slice(0, markerAt(text)));
for (const [to, from] of Object.entries(manifest.installed ?? {})) {
  const path = resolve(productRoot, to);
  if (!existsSync(path)) {
    problems.push(`missing ${to} (installed from sm-core ${from})`);
    continue;
  }
  const want = readFileSync(join(here, from), "utf8");
  const have = readFileSync(path, "utf8");
  const hasMarker = markerAt(want) !== -1;
  if (hasMarker && markerAt(have) === -1) {
    problems.push(`edited ${to}: the ${MARKER} marker is gone`);
  } else if (shared(have) !== shared(want)) {
    problems.push(`edited ${to}${hasMarker ? ` above the ${MARKER} marker` : ""}`);
  }
}

if (problems.length) {
  console.error(`sm-core ${manifest.version} copy has drifted:\n${problems.map((p) => `  ✗ ${p}`).join("\n")}`);
  console.error("Change sm-core and sync a release instead of editing this copy.");
  process.exit(1);
}
console.log(`✓ sm-core ${manifest.version} copy matches its manifest`);
