import { roll } from "@rollin/engine";
import { expect, test } from "vitest";
import { diceStats } from "./analytics";

const stats = (formula: string) => {
  const report = roll(formula, () => 1);
  if (!("ok" in report)) throw new Error("formula should roll");
  return diceStats(report.ok.rolls);
};

test("counts every die and lists each distinct size once, smallest first", () => {
  expect(stats("2d6+d20-1d6")).toEqual({ dice: 4, sides: [6, 20] });
});

test("a formula with no dice reports none", () => {
  expect(stats("3+4")).toEqual({ dice: 0, sides: [] });
});

test("never carries the formula text", () => {
  expect(Object.keys(stats("4d6dl1"))).toEqual(["dice", "sides"]);
});
