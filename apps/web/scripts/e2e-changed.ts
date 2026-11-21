import { selectE2e } from "./e2e-select.ts";

const root = new URL("../../../", import.meta.url).pathname;
const web = new URL("../", import.meta.url).pathname;

async function git(...args: string[]): Promise<string> {
  const run = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const [out, err, code] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
    run.exited,
  ]);
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${err}`);
  }
  return out.trim();
}

export async function main(): Promise<number> {
  const base = await git("merge-base", "HEAD", "origin/main");
  const diff = await git("diff", "--name-only", `${base}...HEAD`);
  const changed = diff.split("\n").filter((line) => line !== "");
  const chosen = selectE2e(changed);
  if (chosen.mode === "none") {
    console.log(`e2e: none of the ${changed.length} changed files can reach the app; skipped`);
    return 0;
  }
  const args = chosen.mode === "specs" ? chosen.specs : [];
  console.log(
    chosen.mode === "specs"
      ? `e2e: only specs changed; running ${args.join(" ")}`
      : `e2e: ${chosen.because} can reach the app; running every browser test`,
  );
  const run = Bun.spawn(["bun", "--bun", "playwright", "test", ...args], {
    cwd: web,
    stdout: "inherit",
    stderr: "inherit",
    windowsHide: true,
  });
  return run.exited;
}
