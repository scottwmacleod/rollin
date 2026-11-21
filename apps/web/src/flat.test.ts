import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

const BANNED =
  /(?<![\w-])(shadow(-[\w/[\]]+)?|rounded(-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?)(?![\w-])/g;

test("no component uses shadows or rounded corners other than rounded-0 and rounded-1", () => {
  const offenders = readdirSync(__dirname)
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
    .flatMap((f) =>
      [...readFileSync(join(__dirname, f), "utf8").matchAll(/"[^"\n]*"|`[^`]*`/g)].flatMap((m) =>
        [...m[0].matchAll(BANNED)].map((b) => `${f}: ${b[0]}`),
      ),
    );
  expect(offenders).toEqual([]);
});
