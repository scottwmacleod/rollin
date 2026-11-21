import { describe, expect, it } from "vitest";

const webDir = new URL("..", import.meta.url).pathname;
const ciYml = new URL("../../../.github/workflows/ci.yml", import.meta.url);

interface Listed {
  file?: unknown;
  line?: unknown;
  column?: unknown;
  title?: unknown;
  projectName?: unknown;
  specs?: unknown;
  suites?: unknown;
  tests?: unknown;
}

function children(value: unknown): Listed[] {
  return Array.isArray(value)
    ? value.filter((item): item is Listed => typeof item === "object" && item !== null)
    : [];
}

function collect(suite: Listed, ids: string[]): void {
  for (const spec of children(suite.specs)) {
    for (const test of children(spec.tests)) {
      ids.push(
        `${String(spec.file)}:${String(spec.line)}:${String(spec.column)} [${String(test.projectName)}] ${String(spec.title)}`,
      );
    }
  }
  for (const child of children(suite.suites)) {
    collect(child, ids);
  }
}

async function listTests(shard?: string): Promise<string[]> {
  const args = ["bun", "--bun", "playwright", "test", "--list", "--reporter=json"];
  if (shard !== undefined) {
    args.push(`--shard=${shard}`);
  }
  const env = Object.fromEntries(
    Object.entries(Bun.env).filter(([name]) => name !== "JEST_WORKER_ID"),
  );
  const run = Bun.spawn(args, { cwd: webDir, env, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
    run.exited,
  ]);
  if (code !== 0) {
    throw new Error(`playwright test --list failed: ${err} ${out.slice(-1500)}`);
  }
  const parsed: unknown = JSON.parse(out);
  const ids: string[] = [];
  collect(typeof parsed === "object" && parsed !== null ? parsed : {}, ids);
  return ids;
}

async function shardsInCi(): Promise<number> {
  const found = /^\s+e2e-shards:\s*(?<count>\d+)\s*$/mu.exec(await Bun.file(ciYml).text());
  return Number(found?.groups?.count ?? "1");
}

describe("e2e shards", () => {
  it("together list every browser test exactly once", async () => {
    expect.hasAssertions();
    const total = await shardsInCi();
    const all = await listTests();
    const shards = await Promise.all(
      Array.from({ length: total }, async (_, k) => {
        const ids = await listTests(`${k + 1}/${total}`);
        return ids;
      }),
    );
    const sharded = shards.flat();
    expect(all.length).toBeGreaterThan(0);
    expect(sharded).toHaveLength(all.length);
    expect(new Set(sharded)).toStrictEqual(new Set(all));
  }, 30_000);
});
