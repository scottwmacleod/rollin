import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { Button } from "./index";

test("Button renders a link with its href", () => {
  const html = renderToStaticMarkup(<Button render={<a href="/x" />}>Go</Button>);
  expect(html).toContain('href="/x"');
  expect(html).toContain("Go");
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

test("only the component layer imports ui-sdk", () => {
  const src = join(__dirname, "..");
  const offenders = sourceFiles(src)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.tsx"))
    .filter((f) => !relative(src, f).startsWith(`ui${sep}`))
    .filter((f) => readFileSync(f, "utf8").includes("@ui-sdk/"));
  expect(offenders).toEqual([]);
});
