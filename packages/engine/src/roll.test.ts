import { describe, expect, test } from "vitest";
import { type DieSource, type RollReport, roll, scriptedDice } from "./index";

/** A die source that always rolls the same face (clamped to the die). */
const always =
  (face: number): DieSource =>
  (sides) =>
    Math.min(face, sides);

const faces = (...values: number[]) =>
  scriptedDice(values.map((face) => ({ sides: face > 20 ? 100 : 6, face })));

function ok(report: RollReport) {
  if (!("ok" in report)) throw new Error(`expected a roll, got ${JSON.stringify(report.error)}`);
  return report.ok;
}

function failure(report: RollReport) {
  if (!("error" in report)) throw new Error("expected an error");
  const { error } = report;
  if (error.kind !== "formula") throw new Error(`expected a formula error, got ${error.kind}`);
  return error;
}

describe("a first roll", () => {
  test("2d6+3 gives a total and each die", () => {
    const dice = scriptedDice([
      { sides: 6, face: 4 },
      { sides: 6, face: 5 },
    ]);
    const [result] = ok(roll("2d6+3", dice)).rolls;
    expect(result?.formula).toBe("2d6+3");
    expect(result?.total).toBe(12);
    expect(result?.expr).toMatchObject({
      type: "chain",
      first: { type: "dice", dice: [{ value: 4 }, { value: 5 }], subtotal: 9 },
    });
  });

  test("the word roll is optional and case does not matter", () => {
    expect(ok(roll("roll 2D6 + 1", always(3))).rolls[0]?.total).toBe(7);
    expect(ok(roll("ROLL d20", always(3))).rolls[0]?.total).toBe(3);
  });

  test("a comma list rolls each formula in turn, ignoring empty ones", () => {
    const rolls = ok(roll("d6,, d4+1,", always(2))).rolls;
    expect(rolls.map((r) => r.total)).toEqual([2, 3]);
  });

  test("an empty line or a bare roll is a usage error", () => {
    for (const line of ["", "   ", "roll"]) {
      expect(roll(line, always(1))).toMatchObject({ error: { kind: "usage" } });
    }
  });
});

describe("integer arithmetic", () => {
  test("division truncates toward zero and zero is never negative", () => {
    expect(ok(roll("-7/2", always(1))).rolls[0]?.total).toBe(-3);
    expect(ok(roll("7/-2", always(1))).rolls[0]?.total).toBe(-3);
    const zero = ok(roll("0*-5", always(1))).rolls[0]?.total;
    expect(Object.is(zero, 0)).toBe(true);
    expect(Object.is(ok(roll("-0", always(1))).rolls[0]?.total, 0)).toBe(true);
  });

  test("totals stay inside the safe integer range, else it is an overflow", () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(ok(roll(`${max}`, always(1))).rolls[0]?.total).toBe(max);
    expect(ok(roll(`${max}-1+1`, always(1))).rolls[0]?.total).toBe(max);
    expect(failure(roll(`${max}+1`, always(1))).error).toEqual({
      kind: "overflow",
      span: { start: 0, end: `${max}+1`.length },
    });
    expect(failure(roll("94906266*94906266", always(1))).error.kind).toBe("overflow");
    expect(failure(roll(`${max + 1}`, always(1))).error.kind).toBe("syntax");
  });

  test("division stays exact for large operands", () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(ok(roll(`${max}/${max - 1}`, always(1))).rolls[0]?.total).toBe(1);
    expect(ok(roll(`${max - 1}/${max}`, always(1))).rolls[0]?.total).toBe(0);
  });
});

describe("errors say what and where", () => {
  test("a syntax error carries the message, source and span", () => {
    const error = failure(roll("2d6+", always(1)));
    expect(error.message).toBe("expected a number, a dice group or '(', found end of input");
    expect(error.source).toBe("2d6+");
    expect(error.error).toMatchObject({ kind: "syntax", span: { start: 4, end: 4 } });
    expect(error.hints).toEqual([]);
  });

  test("spans are UTF-8 byte offsets, as in the Rust engine", () => {
    const error = failure(roll("2d6 ✓", always(1)));
    expect(error.error).toMatchObject({ kind: "syntax", span: { start: 4, end: 7 } });
    // A label may hold any text; the offset after it counts bytes, not characters.
    const after = failure(roll("d6 # é, ✓", always(1)));
    expect(after.error).toMatchObject({ span: { start: 9, end: 12 } });
  });

  test("whitespace of any kind is collapsed into the reported source", () => {
    expect(failure(roll("2d6\t  xyz", always(1))).source).toBe("2d6 xyz");
  });
});

describe("hard limits fail loudly and promptly", () => {
  test("each cap is an error naming the cap, never a hang", () => {
    const cases: [string, string][] = [
      ["1001d6", "dice_per_term"],
      [`${"1000d6+".repeat(10)}1d6`, "dice_per_roll"],
      [`${"(".repeat(33)}d6${")".repeat(33)}`, "nesting_depth"],
      [`${"-".repeat(33)}1`, "nesting_depth"],
    ];
    for (const [line, cap] of cases) {
      const started = performance.now();
      expect(failure(roll(line, always(1))).error).toMatchObject({ kind: "limit_exceeded", cap });
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });

  test("the caps themselves are allowed", () => {
    expect(ok(roll("1000d6", always(1))).rolls[0]?.total).toBe(1000);
    expect(ok(roll(`${"1000d6+".repeat(9)}1000d6`, always(1))).rolls[0]?.total).toBe(10000);
    expect(ok(roll(`${"(".repeat(32)}d6${")".repeat(32)}`, always(1))).rolls[0]?.total).toBe(1);
  });

  test("a very long formula of plain numbers is quick", () => {
    const started = performance.now();
    const line = Array.from({ length: 50_000 }, () => "1").join("+");
    expect(ok(roll(line, always(1))).rolls[0]?.total).toBe(50_000);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("the die source", () => {
  test("a face outside the die is a bug in the source, not a roll", () => {
    expect(() => roll("d6", () => 7)).toThrow(RangeError);
    expect(() => roll("d6", () => 0)).toThrow(RangeError);
    expect(() => roll("d6", () => 1.5)).toThrow(RangeError);
  });

  test("a script that does not match the roll says so", () => {
    expect(() => roll("d6", scriptedDice([]))).toThrow(/script is empty/);
    expect(() => roll("d6", scriptedDice([{ sides: 8, face: 1 }]))).toThrow(/d8/);
    expect(faces(1).remaining()).toBe(1);
  });
});

describe("special dice", () => {
  test("d% is a d100 marked percentile, and the term is kept as typed", () => {
    const dice = scriptedDice([
      { sides: 100, face: 37 },
      { sides: 100, face: 92 },
    ]);
    const [result] = ok(roll("2D%+1", dice)).rolls;
    expect(result?.total).toBe(130);
    expect(result?.expr).toMatchObject({
      type: "chain",
      first: {
        type: "dice",
        term: "2D%",
        sides: 100,
        special: "percentile",
        dice: [{ value: 37 }, { value: 92 }],
      },
    });
    expect(dice.remaining()).toBe(0);
  });

  test("a plain d100 is not marked percentile", () => {
    const [result] = ok(roll("d100", always(50))).rolls;
    expect(result?.expr).not.toHaveProperty("special");
  });

  test("fudge dice are not supported, as in the Rust engine", () => {
    for (const line of ["4dF", "4df", "4dF+2"]) {
      expect(failure(roll(line, always(1))).message, line).toMatch(/found 'df'/);
    }
  });
});
