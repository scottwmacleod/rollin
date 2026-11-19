// sm_ pre-push hook, synced from sm-core. Edit sm-core, not this copy.
//
// Runs format, lint and typecheck on the files this push changes, so mistakes
// are caught before CI. Git runs it through the `pre-push` wrapper; install.mjs sets core.hooksPath.
//
// What runs, in order:
//   1. `npm run pre-push -- <files>` if package.json has that script. It
//      replaces the steps below, for repos that need something else.
//   2. Biome on the changed files (format and lint), if Biome is installed.
//   3. `npm run typecheck`, if that script exists and a code file changed.
//
// No dependencies. Budget: under 9 seconds on a 10-file change.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ZERO = /^0+$/;
const CODE = /\.(c|m)?(j|t)sx?$|(^|\/)tsconfig[^/]*\.json$/;
const started = Date.now();

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return "";
  }
};

const root = git("rev-parse", "--show-toplevel");
process.chdir(root);

// Each stdin line: <local ref> <local sha> <remote ref> <remote sha>
let input = "";
try {
  input = readFileSync(0, "utf8");
} catch {}
const has = (sha) => {
  try {
    git("cat-file", "-e", `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
};
const files = new Set();
for (const line of input.split("\n")) {
  const [, local, , remote] = line.trim().split(/\s+/);
  if (!local || ZERO.test(local)) continue; // deleting a branch
  let base = remote && !ZERO.test(remote) && has(remote) ? remote : "";
  if (!base) {
    // New branch: compare with the default branch.
    const head = tryGit("symbolic-ref", "--short", "refs/remotes/origin/HEAD");
    const candidates = [head, "origin/main", "origin/master"].filter(Boolean);
    for (const c of candidates) {
      base = tryGit("merge-base", c, local);
      if (base) break;
    }
  }
  const out = base
    ? tryGit("diff", "--name-only", "--diff-filter=ACMR", `${base}..${local}`)
    : tryGit("ls-tree", "-r", "--name-only", local); // no shared history: check everything
  for (const f of out.split("\n")) if (f && existsSync(f)) files.add(f);
}

const changed = [...files];
if (!changed.length) process.exit(0);

const pkg = existsSync("package.json") ? JSON.parse(readFileSync("package.json", "utf8")) : {};
const scripts = pkg.scripts ?? {};
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function step(name, cmd, args) {
  const t = Date.now();
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`\n✗ pre-push: ${name} failed (${secs}s). Fix it, commit, and push again.`);
    process.exit(r.status ?? 1);
  }
  console.log(`✓ pre-push: ${name} (${secs}s)`);
}

if (scripts["pre-push"]) {
  step("npm run pre-push", npm, ["run", "pre-push", "--silent", "--", ...changed]);
} else {
  const biome = join("node_modules", ".bin", process.platform === "win32" ? "biome.cmd" : "biome");
  if (existsSync(biome)) {
    step("biome", biome, [
      "check",
      "--no-errors-on-unmatched",
      "--files-ignore-unknown=true",
      ...changed,
    ]);
  }
  if (scripts.typecheck && changed.some((f) => CODE.test(f))) {
    step("typecheck", npm, ["run", "typecheck", "--silent"]);
  }
}
console.log(
  `✓ pre-push: ${changed.length} changed file(s) checked in ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
