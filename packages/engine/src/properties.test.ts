import fc from "fast-check";
import { expect, test } from "vitest";
import { type DieSource, type Node, type RollReport, roll } from "./index";

/** A die source driven by a list of random numbers: each is mapped onto the die's faces. */
function fromSeeds(seeds: readonly number[]): DieSource {
  let next = 0;
  return (sides) => {
    const seed = seeds[next % seeds.length] ?? 0;
    next += 1;
    return 1 + (seed % sides);
  };
}

const seeds = fc.array(fc.nat({ max: 1_000_000 }), { minLength: 1, maxLength: 20 });

function ok(report: RollReport) {
  if (!("ok" in report)) throw new Error(JSON.stringify(report));
  return report.ok.rolls;
}

/** Every die in a node tree. */
function diceIn(node: Node): { sides: number; values: number[] }[] {
  switch (node.type) {
    case "number":
      return [];
    case "dice":
      return [{ sides: node.sides, values: node.dice.map((d) => d.value) }];
    case "neg":
      return diceIn(node.operand);
    case "group":
      return diceIn(node.inner);
    case "chain":
      return [...diceIn(node.first), ...node.rest.flatMap((link) => diceIn(link.node))];
  }
}

test("NdS totals sit between N and N times S, and every face is on the die", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 200 }),
      fc.integer({ min: 2, max: 10000 }),
      seeds,
      (count, sides, s) => {
        const [result] = ok(roll(`${count}d${sides}`, fromSeeds(s)));
        const [group] = diceIn(result?.expr as Node);
        expect(group?.values).toHaveLength(count);
        for (const face of group?.values ?? []) {
          expect(face).toBeGreaterThanOrEqual(1);
          expect(face).toBeLessThanOrEqual(sides);
        }
        expect(result?.total).toBeGreaterThanOrEqual(count);
        expect(result?.total).toBeLessThanOrEqual(count * sides);
        expect(result?.total).toBe(group?.values.reduce((a, b) => a + b, 0));
      },
    ),
  );
});

test("a flat modifier shifts the total by exactly that much", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 30 }),
      fc.integer({ min: 2, max: 100 }),
      fc.integer({ min: 0, max: 1000 }),
      fc.constantFrom("+", "-"),
      seeds,
      (count, sides, flat, op, s) => {
        const [plain] = ok(roll(`${count}d${sides}`, fromSeeds(s)));
        const [shifted] = ok(roll(`${count}d${sides}${op}${flat}`, fromSeeds(s)));
        expect(shifted?.total).toBe((plain?.total ?? 0) + (op === "+" ? flat : -flat));
      },
    ),
  );
});

test("d% rolls 1 to 100", () => {
  fc.assert(
    fc.property(seeds, (s) => {
      const [result] = ok(roll("d%", fromSeeds(s)));
      expect(result?.total).toBeGreaterThanOrEqual(1);
      expect(result?.total).toBeLessThanOrEqual(100);
    }),
  );
});

const TYPED = "0123456789d%+-*/() ,xX!#@<>=abc✓é";

test("any typed text gives a roll or a located error, never a throw or an unsafe total", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(new RegExp(`^[${TYPED.replace(/[\]\\^-]/g, "\\$&")}]{0,40}$`, "u")),
      seeds,
      (text, s) => {
        const report = roll(text, fromSeeds(s));
        if ("ok" in report) {
          for (const r of report.ok.rolls) {
            expect(Number.isSafeInteger(r.total)).toBe(true);
            expect(Object.is(r.total, -0)).toBe(false);
            for (const { sides, values } of diceIn(r.expr)) {
              for (const v of values) {
                expect(v).toBeGreaterThanOrEqual(1);
                expect(v).toBeLessThanOrEqual(sides);
              }
            }
          }
        } else if (report.error.kind === "formula") {
          const bytes = new TextEncoder().encode(report.error.source).length;
          const { span } = report.error.error;
          expect(span.start).toBeGreaterThanOrEqual(0);
          expect(span.start).toBeLessThanOrEqual(span.end);
          expect(span.end).toBeLessThanOrEqual(bytes);
          expect(report.error.message).not.toBe("");
        }
      },
    ),
    { numRuns: 500 },
  );
});

/** Formulas built from the grammar, so most of them roll. */
const formula: fc.Arbitrary<string> = fc.letrec((tie) => ({
  term: fc.oneof(
    fc.integer({ min: 0, max: 99 }).map(String),
    fc
      .tuple(
        fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
        fc.integer({ min: 2, max: 100 }),
      )
      .map(([n, s]) => `${n ?? ""}d${s}`),
    tie("expr").map((e) => `(${e})`),
    tie("term").map((t) => `-${t}`),
  ),
  expr: fc
    .tuple(
      tie("term"),
      fc.array(fc.tuple(fc.constantFrom("+", "-", "*", "/"), tie("term")), { maxLength: 4 }),
    )
    .map(([first, rest]) => first + rest.map(([op, t]) => `${op}${t}`).join("")),
})).expr as fc.Arbitrary<string>;

/** Recomputes a total from the node tree, as an independent check on the evaluator. */
function total(node: Node): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "dice":
      return node.dice.reduce((sum, d) => sum + d.value, 0);
    case "neg":
      return -total(node.operand);
    case "group":
      return total(node.inner);
    case "chain": {
      let running = total(node.first);
      for (const { op, node: operand } of node.rest) {
        const rhs = total(operand);
        running =
          op === "+"
            ? running + rhs
            : op === "-"
              ? running - rhs
              : op === "*"
                ? running * rhs
                : Math.trunc(running / rhs);
      }
      return running;
    }
  }
}

test("generated formulas: the total is what the tree adds up to", () => {
  fc.assert(
    fc.property(formula, seeds, (text, s) => {
      const report = roll(text, fromSeeds(s));
      if (!("ok" in report)) {
        // The only way a well-formed formula here fails is by its arithmetic.
        expect(report.error.kind).toBe("formula");
        return;
      }
      for (const r of report.ok.rolls) {
        // Floating point is exact for these small totals, so the sums must agree.
        if (Math.abs(r.total) < 2 ** 40) expect(r.total + 0).toBe(total(r.expr) + 0);
      }
    }),
    { numRuns: 500 },
  );
});

test("exploding dice and rerolls never pass either cap, and the totals add up", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 2, max: 20 }),
      fc.constantFrom("!", "!!", "!p", "r1", "rr1", "r1!", "rr1!!"),
      seeds,
      (count, sides, clause, s) => {
        const report = roll(`${count}d${sides}${clause}`, fromSeeds(s));
        if ("error" in report) {
          // The only way a valid formula fails is by hitting a cap.
          expect(report.error).toMatchObject({ error: { kind: "limit_exceeded" } });
          return;
        }
        const [result] = report.ok.rolls;
        const node = result?.expr;
        if (node?.type !== "dice") throw new Error("expected a dice term");
        const rerolled = node.dice.filter((d) => d.status === "rerolled").length;
        const exploded = node.dice.filter((d) => d.status === "exploded").length;
        // Each original die stands once, so only extras and rerolls add to the count.
        expect(node.dice.length).toBe(count + rerolled + exploded);
        expect(rerolled).toBeLessThanOrEqual(count * 100);
        expect(exploded).toBeLessThanOrEqual(count * 100);
        const counted = node.dice.filter((d) => d.status !== "rerolled");
        expect(result?.total).toBe(counted.reduce((sum, d) => sum + d.value, 0));
      },
    ),
  );
});
