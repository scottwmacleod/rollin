import fc from "fast-check";
import { expect, test } from "vitest";
import { type DieSource, type Node, type RollReport, roll, spanOf } from "./index";

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
          const span = spanOf(report.error.error);
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

const mode = fc.constantFrom("kh", "kl", "dh", "dl");

test("keep and drop always leave the right number of dice, and the total is the kept sum", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 30 }),
      fc.integer({ min: 2, max: 100 }),
      mode,
      fc.integer({ min: 1, max: 29 }),
      seeds,
      (count, sides, kind, rawN, s) => {
        const n = 1 + ((rawN - 1) % (count - 1));
        const [result] = ok(roll(`${count}d${sides}${kind}${n}`, fromSeeds(s)));
        const node = result?.expr as Extract<Node, { type: "dice" }>;
        const kept = node.dice.filter((d) => d.status === "kept");
        expect(kept).toHaveLength(kind.startsWith("k") ? n : count - n);
        expect(node.dice.filter((d) => d.status === "dropped")).toHaveLength(count - kept.length);
        expect(result?.total).toBe(kept.reduce((a, d) => a + d.value, 0));
        // Every kept die is at least as good as every dropped one.
        const high = kind === "kh" || kind === "dl";
        const dropped = node.dice.filter((d) => d.status === "dropped");
        for (const k of kept) {
          for (const d of dropped) {
            expect(high ? k.value >= d.value : k.value <= d.value).toBe(true);
          }
        }
      },
    ),
  );
});

test("adv and dis match 2d20kh1 and 2d20kl1 die for die", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("adv", "dis"),
      fc.integer({ min: 2, max: 100 }),
      seeds,
      (word, sides, s) => {
        const keep = word === "adv" ? "kh" : "kl";
        const [a] = ok(roll(`d${sides}${word}`, fromSeeds(s)));
        const [b] = ok(roll(`2d${sides}${keep}1`, fromSeeds(s)));
        expect(a?.total).toBe(b?.total);
        const dice = (r: typeof a) =>
          (r?.expr as Extract<Node, { type: "dice" }>).dice.map((d) => [d.value, d.status]);
        expect(dice(a)).toEqual(dice(b));
      },
    ),
  );
});

// ---- Ports of the remaining Rust proptest suite (tests/properties.rs) ----

const CMP = [">", ">=", "<", "<=", "="] as const;

function condMatches(cmp: number, v: number, face: number): boolean {
  switch (cmp) {
    case 0:
      return face > v;
    case 1:
      return face >= v;
    case 2:
      return face < v;
    case 3:
      return face <= v;
    default:
      return face === v;
  }
}

/** Index 5 is the bare-number form, which means equals. */
function condText(cmp: number, v: number): string {
  return cmp === 5 ? String(v) : `${CMP[cmp]}${v}`;
}

/** Every error span lies inside the text and on a character boundary. */
function expectSpanInside(text: string, report: RollReport): void {
  if (!("error" in report) || report.error.kind !== "formula") return;
  const bytes = new TextEncoder().encode(text);
  const span = spanOf(report.error.error);
  expect(span.start).toBeLessThanOrEqual(span.end);
  expect(span.end).toBeLessThanOrEqual(bytes.length);
  // A byte offset is on a boundary unless it lands on a UTF-8 continuation byte.
  for (const at of [span.start, span.end]) {
    if (at < bytes.length) expect((bytes[at] ?? 0) & 0b1100_0000).not.toBe(0b1000_0000);
  }
}

/** Text drawn from an alphabet of tokens, so many strings are almost valid. */
const fromTokens = (tokens: readonly string[], max: number) =>
  fc.array(fc.constantFrom(...tokens), { maxLength: max }).map((parts) => parts.join(""));

const ALPHABETS: Record<string, [readonly string[], number]> = {
  "dice-like": [[..."0123456789dDfFkKlLhHpPrR+-*/() ,!<>=%aAvVsSiI#xX"], 40],
  "success-like": [[..."0123456789dDfF+-*/(), <>=!rRkKhHlLé%aAvVsSiI"], 30],
  "special dice": [
    [
      "d",
      "D",
      "%",
      "f",
      "adv",
      "ADV",
      "dis",
      "DIS",
      "dl",
      "kh",
      "r",
      "!",
      ">=",
      "+",
      "*",
      ",",
      " ",
      "é",
      "-",
      "0",
      "1",
      "2",
      "5",
    ],
    16,
  ],
  "repeat and label": [[..."0123456789dDxX#,é ()+*a"], 30],
  "error spans": [[..."0123456789dDfFkKlLhHpPrR+-*/() ,!<>=é"], 40],
};

for (const [name, [tokens, max]] of Object.entries(ALPHABETS)) {
  test(`${name} strings never throw, and error spans stay inside the input`, () => {
    fc.assert(
      fc.property(fromTokens(tokens, max), seeds, (text, s) => {
        const report = roll(text, fromSeeds(s));
        expectSpanInside(
          text
            .split(/\s+/u)
            .filter(Boolean)
            .join(" ")
            .replace(/^roll /iu, ""),
          report,
        );
      }),
      { numRuns: 512 },
    );
  });
}

test("arbitrary text never throws", () => {
  fc.assert(
    fc.property(fc.string({ unit: "binary", maxLength: 60 }), (text) => {
      roll(text, fromSeeds([1, 2, 3]));
    }),
    { numRuns: 512 },
  );
});

/** A dice-free expression, rendered and also evaluated by an independent oracle (BigInt, checked to the safe range). */
type Gen =
  | { t: "num"; n: number }
  | { t: "neg"; e: Gen }
  | { t: "paren"; e: Gen }
  | { t: "bin"; l: Gen; op: "+" | "-" | "*" | "/"; r: Gen };

const render = (g: Gen): string => {
  const operand = (x: Gen) => (x.t === "bin" ? `(${render(x)})` : render(x));
  switch (g.t) {
    case "num":
      return String(g.n);
    case "neg":
      return `-${operand(g.e)}`;
    case "paren":
      return `(${render(g.e)})`;
    case "bin":
      return `${operand(g.l)} ${g.op} ${operand(g.r)}`;
  }
};

const gen: fc.Arbitrary<Gen> = fc.letrec<{ e: Gen; leaf: Gen }>((tie) => ({
  leaf: fc.oneof(
    { weight: 3, arbitrary: fc.integer({ min: 0, max: 100 }).map((n): Gen => ({ t: "num", n })) },
    { weight: 1, arbitrary: fc.constant<Gen>({ t: "num", n: Number.MAX_SAFE_INTEGER }) },
    {
      weight: 1,
      arbitrary: fc.integer({ min: 0, max: 1_000_000_000_000 }).map((n): Gen => ({ t: "num", n })),
    },
  ),
  e: fc.oneof(
    { depthSize: "small", maxDepth: 4 },
    tie("leaf"),
    tie("e").map((e): Gen => ({ t: "neg", e })),
    tie("e").map((e): Gen => ({ t: "paren", e })),
    fc
      .tuple(tie("e"), fc.constantFrom("+", "-", "*", "/"), tie("e"))
      .map(([l, op, r]): Gen => ({ t: "bin", l, op, r })),
  ),
})).e;

/** The oracle: exact integers, with the engine's rule that no result leaves the safe range. */
function oracle(g: Gen): bigint | "zero" | "overflow" {
  const LIMIT = BigInt(Number.MAX_SAFE_INTEGER);
  const fit = (v: bigint) => (v > LIMIT || v < -LIMIT ? "overflow" : v);
  switch (g.t) {
    case "num":
      return BigInt(g.n);
    case "paren":
      return oracle(g.e);
    case "neg": {
      const v = oracle(g.e);
      return typeof v === "bigint" ? -v : v;
    }
    case "bin": {
      const l = oracle(g.l);
      if (typeof l !== "bigint") return l;
      const r = oracle(g.r);
      if (typeof r !== "bigint") return r;
      switch (g.op) {
        case "+":
          return fit(l + r);
        case "-":
          return fit(l - r);
        case "*":
          return fit(l * r);
        default:
          return r === 0n ? "zero" : fit(l / r);
      }
    }
  }
}

test("dice-free expressions match an independent exact-integer oracle", () => {
  fc.assert(
    fc.property(gen, (g) => {
      const text = render(g);
      const want = oracle(g);
      const got = roll(text, fromSeeds([0]));
      if (typeof want === "bigint") {
        // Numbers beyond the safe range are refused as too large, which the Rust engine's wider integers allow.
        if ("ok" in got) expect(BigInt(got.ok.rolls[0]?.total ?? 0)).toBe(want);
        else
          expect(got.error).toMatchObject({
            error: { kind: expect.stringMatching(/syntax|overflow/) },
          });
      } else if (want === "zero") {
        expect(got).toMatchObject({ error: { error: { kind: "division_by_zero" } } });
      } else {
        expect(got).toMatchObject({
          error: { error: { kind: expect.stringMatching(/overflow|syntax/) } },
        });
      }
    }),
    { numRuns: 512 },
  );
});

test("flat chains follow standard precedence, truncating division toward zero", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 50 }),
      fc.array(fc.tuple(fc.constantFrom("+", "-", "*", "/"), fc.integer({ min: 1, max: 50 })), {
        maxLength: 8,
      }),
      (first, rest) => {
        const text = String(first) + rest.map(([op, n]) => `${op}${n}`).join("");
        const terms = [first];
        for (const [op, n] of rest) {
          const last = terms.length - 1;
          if (op === "+") terms.push(n);
          else if (op === "-") terms.push(-n);
          else if (op === "*") terms[last] = (terms[last] ?? 0) * n;
          else terms[last] = Math.trunc((terms[last] ?? 0) / n);
        }
        const want = terms.reduce((a, b) => a + b, 0);
        const [got] = ok(roll(text, fromSeeds([0])));
        expect((got?.total ?? Number.NaN) + 0).toBe(want + 0);
      },
    ),
  );
});

test("a success count totals the matching counting dice minus the failures", () => {
  const formulaOf = fc
    .tuple(
      fc.integer({ min: 1, max: 8 }),
      fc.integer({ min: 2, max: 20 }),
      fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 22 })),
      fc.option(fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 22 })), {
        nil: undefined,
      }),
      fc.tuple(
        fc.boolean(),
        fc.boolean(),
        fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
      ),
    )
    .map(([n, sides, success, failure, [reroll, explode, drop]]) => {
      const dropText = drop !== undefined && drop < n ? `dl${drop}` : "";
      const text =
        `${n}d${sides}${reroll ? "r=1" : ""}${explode ? `!=${sides}` : ""}${dropText}` +
        `${condText(success[0], success[1])}${failure ? `f${condText(failure[0], failure[1])}` : ""}`;
      return { text, success, failure, sides };
    });
  fc.assert(
    fc.property(formulaOf, seeds, ({ text, success, failure, sides }, s) => {
      const report = roll(text, fromSeeds(s));
      if ("error" in report) {
        // Only the caps may fail a roll.
        expect(report.error).toMatchObject({
          error: { kind: expect.stringMatching(/limit_exceeded|infinite_explosion/) },
        });
        return;
      }
      const [result] = report.ok.rolls;
      expect(result?.kind).toBe("count");
      const node = result?.expr;
      if (node?.type !== "dice") throw new Error(`${text}: not a dice node`);
      let successes = 0;
      let failures = 0;
      for (const d of node.dice) {
        const counts = d.status === "kept" || d.status === "exploded";
        const want = !counts
          ? undefined
          : condMatches(success[0], success[1], d.value)
            ? "success"
            : failure && condMatches(failure[0], failure[1], d.value)
              ? "failure"
              : undefined;
        expect(d.outcome, `${text}: ${JSON.stringify(d)}`).toBe(want);
        successes += want === "success" ? 1 : 0;
        failures += want === "failure" ? 1 : 0;
        expect(d.value).toBeGreaterThanOrEqual(1);
        expect(d.value).toBeLessThanOrEqual(sides);
      }
      expect([node.successes, node.failures]).toEqual([successes, failures]);
      expect(node.subtotal).toBe(successes - failures);
      expect(result?.total).toBe(successes - failures);
    }),
    { numRuns: 512 },
  );
});

test("percentile dice are d100s, die for die", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 30 }), seeds, (n, s) => {
      const [pct] = ok(roll(`${n}d%`, fromSeeds(s)));
      const [hundred] = ok(roll(`${n}d100`, fromSeeds(s)));
      const faces = (r: typeof pct) => diceIn(r?.expr as Node).flatMap((g) => g.values);
      for (const v of faces(pct)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(faces(pct)).toEqual(faces(hundred));
      expect(pct?.total).toBe(hundred?.total);
    }),
  );
});

test("adv keeps the higher of its two dice, dis the lower, and drops the other", () => {
  fc.assert(
    fc.property(fc.integer({ min: 2, max: 1000 }), seeds, (sides, s) => {
      for (const [suffix, keepsMax] of [
        ["adv", true],
        ["dis", false],
      ] as const) {
        const [r] = ok(roll(`d${sides}${suffix}`, fromSeeds(s)));
        const node = r?.expr as Extract<Node, { type: "dice" }>;
        expect(node.dice).toHaveLength(2);
        const values = node.dice.map((d) => d.value);
        const kept = node.dice.filter((d) => d.status === "kept");
        expect(kept).toHaveLength(1);
        expect(kept[0]?.value).toBe(keepsMax ? Math.max(...values) : Math.min(...values));
        expect(node.dice.filter((d) => d.status === "dropped")).toHaveLength(1);
        expect(r?.total).toBe(kept[0]?.value);
      }
    }),
  );
});

test("repeat yields N times the rolls, numbered in order, with no iteration without Nx", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100 }),
      fc.stringMatching(/^ {0,2}$/),
      fc.constantFrom("x", "X"),
      seeds,
      (n, sp, x, s) => {
        const list = "d20+5, 2d6, 3";
        const rolls = ok(roll(`${n}${sp}${x} ${list}`, fromSeeds(s)));
        expect(rolls).toHaveLength(3 * n);
        rolls.forEach((r, i) => {
          expect(r.iteration).toBe(Math.floor(i / 3) + 1);
        });
        expect(ok(roll(list, fromSeeds(s))).every((r) => r.iteration === undefined)).toBe(true);
      },
    ),
  );
});

test("a label never changes the dice, totals or formula", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(/^[a-z0-9 ()#!é✨%x-]{0,12}$/u),
      fc.integer({ min: 1, max: 5 }),
      seeds,
      (rest, n, s) => {
        const label = `a${rest}`;
        const bare = "4d6dl1, d20adv+5, 6d10>=8f1";
        const tagged = `4d6dl1 # ${label}, d20adv+5 #${label}, 6d10>=8f1 # ${label}`;
        const a = ok(roll(`${n}x ${bare}`, fromSeeds(s)));
        const b = ok(roll(`${n}x ${tagged}`, fromSeeds(s)));
        expect(b).toHaveLength(a.length);
        a.forEach((x, i) => {
          const y = b[i];
          expect(y?.total).toBe(x.total);
          expect(y?.expr).toEqual(x.expr);
          expect(y?.formula).toBe(x.formula);
          // A typed line has its runs of spaces collapsed before it is parsed.
          expect(y?.label).toBe(label.split(/ +/u).join(" ").trim());
          expect(y?.iteration).toBe(x.iteration);
        });
      },
    ),
  );
});

/** Every dice feature in one generator: random valid formulas, to be fuzzed. */
const featureFormula = fc
  .tuple(
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 2, max: 30 }),
    fc.constantFrom(
      "",
      "!",
      "!!",
      "!p",
      "r1",
      "rr<2",
      "kh1",
      "dl1",
      "adv",
      ">=5",
      ">=5f1",
      "!>3kh2",
    ),
    fc.constantFrom("", "+3", "-2", "*2", "/2", "+d6", "+2d8kl1"),
    fc.constantFrom("", " # note"),
    fc.constantFrom("", "3x "),
  )
  .map(
    ([n, sides, clause, tail, label, repeat]) => `${repeat}${n}d${sides}${clause}${tail}${label}`,
  );

test("fuzzing random valid formulas never crashes or hangs", () => {
  fc.assert(
    fc.property(featureFormula, seeds, (text, s) => {
      const started = performance.now();
      const report = roll(text, fromSeeds(s));
      expect(performance.now() - started).toBeLessThan(2000);
      if ("error" in report) {
        // Valid syntax can still fail on a rule (keeping more than rolled, say), but always with a located error.
        expect(report.error.kind).toBe("formula");
        expectSpanInside(text, report);
      } else {
        for (const r of report.ok.rolls) expect(Number.isSafeInteger(r.total)).toBe(true);
      }
    }),
    { numRuns: 1000 },
  );
});
