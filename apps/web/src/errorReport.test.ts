import { expect, test } from "vitest";

import { buildReport, componentsOf, errorKind, framesOf } from "./errorReport";

const context = {
  version: "abc1234",
  userAgent: "TestBrowser/1.0",
  time: "2026-11-15T00:00:00.000Z",
};

function failure(message: string, stack: string, name = "TypeError"): Error {
  const error = new Error(message);
  error.name = name;
  error.stack = `${name}: ${message}\n${stack}`;
  return error;
}

const chrome = failure(
  "no preset called Gorbag's Axe",
  [
    "    at roll (https://rollin.scottmacleod.co/assets/index-Dk3.js:1:2345)",
    "    at async submit (https://rollin.scottmacleod.co/assets/index-Dk3.js:1:9001?v=2:4)",
  ].join("\n"),
);

test("a report names the build, browser and error kind", () => {
  const report = buildReport(chrome, context);
  expect(report).toContain("Version: abc1234");
  expect(report).toContain("Browser: TestBrowser/1.0");
  expect(report).toContain("Error: TypeError");
  expect(report).toContain("index-Dk3.js:1:2345");
});

test("a report never contains the error message or the origin", () => {
  const report = buildReport(chrome, context, "    at Roller (https://x.test/a.js:1:1)");
  expect(report).not.toContain("Gorbag");
  expect(report).not.toContain("preset called");
  expect(report).not.toContain("rollin.scottmacleod.co");
});

test("frames read from Chrome and Safari stacks alike, and skip the message line", () => {
  const safari = new Error("secret name");
  safari.stack =
    "roll@https://h.test/assets/index-1.js:3:4\nglobal code@https://h.test/assets/index-1.js:9:9";
  expect(framesOf(safari)).toEqual(["index-1.js:3:4", "index-1.js:9:9"]);
  const tricky = failure("at evil (https://h.test/steal.js:1:1)", "");
  expect(framesOf(tricky)).toEqual([]);
  const multiline = failure(
    "line one\nx@https://h.test/leak.js:1:1",
    "    at ok (https://h.test/a.js:2:2)",
  );
  expect(framesOf(multiline)).toEqual(["a.js:2:2"]);
});

test("a thrown string or an odd error name leaks nothing", () => {
  expect(errorKind("Gorbag the Goblin")).toBe("UnknownError");
  const odd = new Error("x");
  odd.name = "Gorbag the Goblin";
  expect(errorKind(odd)).toBe("UnknownError");
  expect(buildReport("Gorbag", context)).toContain("Where: unknown");
});

test("component names are kept and their file locations dropped", () => {
  const stack =
    "\n    at Result (https://h.test/src/Result.tsx:10:5)\n    at App (https://h.test/src/App.tsx:1:1)";
  expect(componentsOf(stack)).toEqual(["Result", "App"]);
  expect(buildReport(chrome, context, stack)).toContain("Components: Result < App");
});
