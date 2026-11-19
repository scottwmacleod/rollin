import { roll, scriptedDice } from "@rollin/engine";
import { expect, test } from "vitest";
import { breakdown, type Cell } from "./breakdown";

function firstRoll(line: string, faces: { sides: number; face: number }[]) {
  const report = roll(line, scriptedDice(faces));
  if (!("ok" in report)) throw new Error("expected a roll");
  const first = report.ok.rolls[0];
  if (!first) throw new Error("expected a roll");
  return first;
}

/** The line as text, each die as its face and status, for comparing whole lines. */
function read(cells: Cell[]): string[] {
  return cells.map((cell) =>
    cell.type === "text"
      ? cell.text
      : `${cell.term}: ${cell.dice.map((d) => `${d.value}${d.mark ? ` ${d.mark}` : ""}`).join(", ")}`,
  );
}

const d6 = (face: number) => ({ sides: 6, face });

test("each dice group is its term and dice, in written order, with the operators and brackets between", () => {
  const r = firstRoll("2d6 + (d8 - 1)", [d6(4), d6(5), { sides: 8, face: 3 }]);
  expect(read(breakdown(r))).toEqual(["2d6: 4, 5", "+", "(", "d8: 3", "-", "1", ")"]);
});

test("rerolled and dropped dice stay on the line, marked; the die that exploded is marked, not the one it added", () => {
  expect(read(breakdown(firstRoll("2d6r1", [d6(1), d6(4), d6(5)])))).toEqual([
    "2d6r1: 1 rerolled, 4, 5",
  ]);
  expect(read(breakdown(firstRoll("2d6!", [d6(6), d6(3), d6(2)])))).toEqual([
    "2d6!: 6 exploded, 3, 2",
  ]);
  expect(read(breakdown(firstRoll("1d6!", [d6(6), d6(6), d6(1)])))).toEqual([
    "1d6!: 6 exploded, 6 exploded, 1",
  ]);
  expect(read(breakdown(firstRoll("1d6!!", [d6(6), d6(2)])))).toEqual(["1d6!!: 8 exploded"]);
  expect(read(breakdown(firstRoll("3d6dl1", [d6(2), d6(5), d6(4)])))).toEqual([
    "3d6dl1: 2 dropped, 5, 4",
  ]);
});

test("a formula without dice has no line", () => {
  expect(breakdown(firstRoll("3+4", []))).toEqual([]);
});
