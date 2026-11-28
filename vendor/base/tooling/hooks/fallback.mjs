import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const hook = process.argv[2];
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
process.chdir(git("rev-parse", "--show-toplevel"));

const pkg = existsSync("package.json") ? JSON.parse(readFileSync("package.json", "utf8")) : {};
const scripts = pkg.scripts ?? {};
const usesBun = String(pkg.packageManager ?? "").startsWith("bun@") || existsSync("bun.lock");
const pm = usesBun ? "bun" : "npm";
const command = (name, files = []) =>
  usesBun
    ? ["run", "--silent", name, ...files]
    : ["run", name, "--silent", ...(files.length ? ["--", ...files] : [])];

function run(name, files) {
  if (!scripts[name]) return;
  const started = Date.now();
  const r = spawnSync(pm, command(name, files), { stdio: "inherit", shell: process.platform === "win32" });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`✗ ${hook}: ${pm} run ${name} failed (${secs}s). Fix the cause; don't skip the hook.`);
    process.exit(r.status ?? 1);
  }
  console.log(`✓ ${hook}: ${pm} run ${name} (${secs}s)`);
}

const tip = `${hook}: hk isn't installed, so this runs the plain fallback. Install hk (mise use -g hk, or brew install hk) to get the full hook.`;

if (hook === "pre-commit") {
  const staged = git("diff", "--cached", "--name-only", "--diff-filter=ACMR").split("\n").filter(Boolean);
  if (!staged.length || !scripts.lint) process.exit(0);
  console.warn(`${tip} It checks without fixing.`);
  run("lint", staged);
} else if (hook === "pre-push") {
  let input = "";
  try {
    input = readFileSync(0, "utf8");
  } catch {}
  const refs = input.split("\n").filter((line) => line.trim());
  const pushesCommits = !refs.length || refs.some((line) => !/^0+$/.test(line.trim().split(/\s+/)[1] ?? ""));
  const script = scripts["pre-push"] ? "pre-push" : "check";
  if (!pushesCommits || !scripts[script]) process.exit(0);
  console.warn(tip);
  run(script);
}
