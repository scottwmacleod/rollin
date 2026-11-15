/**
 * Replays the Rust engine's fixtures (tests/fixtures/parity) through the
 * TypeScript engine. Each case scripts the dice the Rust engine drew, rolls the
 * line, and expects the same result, the same dice asked for in the same order,
 * and every draw used.
 *
 * This covers dice terms, integer arithmetic with their limits and errors,
 * presets (global, and a character's own, which shadow them) and `@variables`. Whatever syntax
 * a later loop of #216 adds moves out of `DEFERRED`
 * and into the run, so the list shrinks until it is empty.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type Draw, roll, scriptedDice } from "./index";

interface Context {
  character?: { name: string; presets?: Record<string, string>; vars?: Record<string, number> };
  global_presets?: Record<string, string>;
}

interface Case {
  name: string;
  line: string;
  context?: Context;
  draws: Draw[];
  expected: unknown;
}

interface Area {
  area: string;
  format_version: number;
  cases: Case[];
}

const FIXTURES = join(__dirname, "../../../tests/fixtures/parity");

const areas: Area[] = readdirSync(FIXTURES)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as Area);

/** Areas whose syntax a later loop brings: every case in them waits. */
const DEFERRED_AREAS: Record<string, string> = {
  d20_checks: "the d20 check rule (loop 5)",
  dnd5e: "game systems (loop 5)",
};

/** Single cases in covered areas that use syntax a later loop brings. */
const DEFERRED_CASES: Record<string, string> = {
  "keep_drop/advantage_spaced": "the d20 check rule marks a natural 20 (loop 5)",
  "presets/preset_repeat": "the d20 check rule marks a natural 20 (loop 5)",
  "presets/preset_dnd5e_crit": "game systems (loop 5)",
  "errors/session_word_one_shot": "a command-line-only message, gone with the CLI (#239)",
};

/**
 * Cases where the answer differs on purpose. The Rust engine does its sums in
 * 64-bit integers; this one keeps every number inside JavaScript's safe
 * integers (2^53 - 1), so it reports "number is too large" or an overflow
 * sooner. `expected` is what the TypeScript engine says instead.
 */
const DIVERGENT: Record<string, unknown> = {
  "errors/overflow_add": {
    error: {
      kind: "formula",
      error: { kind: "syntax", message: "number is too large", span: { start: 0, end: 19 } },
      message: "number is too large",
      hints: [],
      source: "9223372036854775807+1",
    },
  },
  "errors/overflow_mul": {
    error: {
      kind: "formula",
      error: { kind: "syntax", message: "number is too large", span: { start: 0, end: 19 } },
      message: "number is too large",
      hints: [],
      source: "4611686018427387904*2",
    },
  },
};

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("deferred lists stay honest", () => {
  test("every deferred area and case still exists in the fixtures", () => {
    const names = new Set(areas.flatMap((a) => a.cases.map((c) => `${a.area}/${c.name}`)));
    for (const key of [...Object.keys(DEFERRED_CASES), ...Object.keys(DIVERGENT)]) {
      expect(names.has(key), key).toBe(true);
    }
    for (const area of Object.keys(DEFERRED_AREAS)) {
      expect(
        areas.some((a) => a.area === area),
        area,
      ).toBe(true);
    }
  });

  test("the loop covers a real share of the fixtures", () => {
    const covered = areas
      .filter((a) => !(a.area in DEFERRED_AREAS))
      .flatMap((a) => a.cases.filter((c) => !(`${a.area}/${c.name}` in DEFERRED_CASES)));
    expect(covered.length).toBeGreaterThan(50);
  });
});

for (const area of areas) {
  if (area.area in DEFERRED_AREAS) continue;
  describe(`parity: ${area.area}`, () => {
    test("fixture format is the one this harness reads", () => {
      expect(area.format_version).toBe(1);
    });
    for (const fixture of area.cases) {
      const key = `${area.area}/${fixture.name}`;
      if (key in DEFERRED_CASES) continue;
      test(fixture.name, () => {
        const dice = scriptedDice(fixture.draws);
        const result = roll(fixture.line, dice, {
          globalPresets: fixture.context?.global_presets,
          character: fixture.context?.character,
        });
        expect(json(result)).toEqual(key in DIVERGENT ? DIVERGENT[key] : fixture.expected);
        // A roll that finishes (or fails) has used exactly the dice the Rust engine drew.
        if (!(key in DIVERGENT)) expect(dice.remaining()).toBe(0);
      });
    }
  });
}
