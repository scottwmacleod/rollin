import { expect, test } from "vitest";

import { accept, complete } from "./completion";

const data = { presets: ["attack", "arcana", "stealth"], variables: ["str", "dex", "prof"] };

test("the first word completes to preset names, sorted", () => {
  expect(complete("a", 1, data)).toEqual({ start: 0, candidates: ["arcana", "attack"] });
  expect(complete("ATT", 3, data).candidates).toEqual(["attack"]);
});

test("a name that is already complete offers nothing", () => {
  expect(complete("attack", 6, data).candidates).toEqual([]);
});

test("a later word does not complete to presets", () => {
  expect(complete("d20 + att", 9, data).candidates).toEqual([]);
});

test("a word after `roll` still completes", () => {
  expect(complete("roll st", 7, data)).toEqual({ start: 5, candidates: ["stealth"] });
});

test("@ completes to variables anywhere, from the @", () => {
  expect(complete("d20+@", 5, data)).toEqual({ start: 4, candidates: ["@dex", "@prof", "@str"] });
  expect(complete("d20+@s", 6, data)).toEqual({ start: 4, candidates: ["@str"] });
});

test("only the text before the caret counts", () => {
  expect(complete("d20+@s+1", 6, data).candidates).toEqual(["@str"]);
});

test("digits and dice never complete", () => {
  expect(complete("2d6", 3, data).candidates).toEqual([]);
  expect(complete("", 0, data).candidates).toEqual([]);
});

test("accepting replaces the word and keeps the rest", () => {
  const line = "d20+@s+1";
  const completion = complete(line, 6, data);
  expect(accept(line, 6, completion, "@str")).toEqual({ line: "d20+@str+1", caret: 8 });
});
