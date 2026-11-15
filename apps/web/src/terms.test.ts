import { roll, scriptedDice } from "@rollin/engine";
import { expect, test } from "vitest";
import { terms } from "./terms";

function firstRoll(line: string, faces: { sides: number; face: number }[]) {
  const report = roll(line, scriptedDice(faces));
  if (!("ok" in report)) throw new Error("expected a roll");
  const first = report.ok.rolls[0];
  if (!first) throw new Error("expected a roll");
  return first;
}

test("terms lists each dice term with its faces and subtotal, in written order", () => {
  const r = firstRoll("2d6 + (d8 - 1)", [
    { sides: 6, face: 4 },
    { sides: 6, face: 5 },
    { sides: 8, face: 3 },
  ]);
  expect(terms(r).map((t) => [t.label, t.dice.map((d) => d.value), t.subtotal])).toEqual([
    ["2d6", [4, 5], 9],
    ["d8", [3], 3],
  ]);
});

test("a formula without dice has no terms", () => {
  expect(terms(firstRoll("3+4", []))).toEqual([]);
});
