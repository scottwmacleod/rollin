import { describe, expect, it } from "vitest";

import { selectE2e } from "../scripts/e2e-select.ts";

describe("e2e selection", () => {
  it("runs every browser test when app source changes", () => {
    expect(selectE2e(["docs/adr/0001.md", "apps/web/src/ui/Log.tsx"])).toStrictEqual({
      mode: "all",
      because: "apps/web/src/ui/Log.tsx",
    });
  });

  it("runs every browser test for engine source, config, lockfile and e2e helpers", () => {
    for (const file of [
      "packages/engine/src/roll.ts",
      "apps/web/playwright.config.ts",
      "bun.lock",
      "package.json",
      "apps/web/e2e/helpers.ts",
      "vendor/base/sm-core.css",
      "apps/web/index.html",
    ]) {
      expect(selectE2e([file])).toStrictEqual({ mode: "all", because: file });
    }
  });

  it("runs only the changed specs when nothing else can reach the app", () => {
    expect(
      selectE2e(["apps/web/e2e/roll.spec.ts", "README.md", "apps/web/e2e/a11y.spec.ts"]),
    ).toStrictEqual({ mode: "specs", specs: ["e2e/roll.spec.ts", "e2e/a11y.spec.ts"] });
  });

  it("skips browser tests for docs, CI config and unit tests", () => {
    expect(
      selectE2e([
        "docs/agents/implement.md",
        ".github/workflows/ci.yml",
        "apps/web/src/ui/Log.test.tsx",
        "packages/engine/src/roll.test.ts",
        "test/setup.ts",
      ]),
    ).toStrictEqual({ mode: "none" });
  });
});
