import { expect, test } from "vitest";

import { type PaletteData, paletteRows, paletteView, parseQuery } from "./palette";

const data: PaletteData = {
  presets: [
    { name: "attack", formula: "d20+@str", scope: "character" },
    { name: "fireball", formula: "8d6", scope: "global" },
  ],
  characters: ["default", "mira"],
  active: { name: "mira", vars: { str: 3 }, presets: { attack: "d20+@str" } },
  hasLog: false,
};
const rows = paletteRows(data);
const labels = (query: string) => paletteView(rows, query).rows.map((r) => r.label);

test("nothing typed lists presets, then the always-visible commands", () => {
  expect(labels("")).toEqual([
    "attack",
    "fireball",
    "New preset…",
    "New character…",
    "New variable…",
    "Export backup",
    "Import backup…",
    "Settings",
    "Clear roll log",
  ]);
});

test("clear is disabled while the log is empty", () => {
  expect(rows.find((r) => r.value === "command:clear-log")?.disabled).toBe(true);
  const full = paletteRows({ ...data, hasLog: true });
  expect(full.find((r) => r.value === "command:clear-log")?.disabled).toBe(false);
});

test("@ searches characters only, and lists them all when empty", () => {
  expect(labels("@")).toEqual(["default", "mira"]);
  expect(labels("@mi")).toEqual(["mira"]);
});

test("> searches commands only", () => {
  expect(labels(">new")).toEqual(["New preset…", "New character…", "New variable…"]);
  expect(parseQuery(">  new")).toEqual({ scope: "commands", term: "new" });
});

test("plain typing finds presets, characters and edit commands", () => {
  expect(labels("mir")).toEqual(["mira", "Edit character mira"]);
  expect(labels("fire")).toEqual(["fireball", "Edit preset fireball"]);
  expect(labels("edit var")).toEqual(["Edit variable @str"]);
});

test("search is fuzzy: letters in order, and prefixes rank first", () => {
  expect(labels("fbl")).toContain("fireball");
  expect(labels("set")[0]).toBe("Settings");
});

test("nothing matches nothing", () => {
  expect(labels("zzzz")).toEqual([]);
});
