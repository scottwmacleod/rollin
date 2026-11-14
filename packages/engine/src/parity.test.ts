/**
 * Replays the Rust engine's fixtures (tests/fixtures/parity) through the
 * TypeScript engine. Each case scripts the dice the Rust engine drew, rolls the
 * line, and expects the same result, the same dice asked for in the same order,
 * and every draw used.
 *
 * This loop covers dice terms and integer arithmetic with their limits and
 * errors. Whatever syntax a later loop of #216 adds moves out of `DEFERRED`
 * and into the run, so the list shrinks until it is empty.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type Draw, roll, scriptedDice } from "./index";

interface Case {
  name: string;
  line: string;
  context?: unknown;
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
  characters: "characters and variables (loop 5)",
  d20_checks: "the d20 check rule (loop 5)",
  dnd5e: "game systems (loop 5)",
  exploding: "exploding dice (loop 3)",
  keep_drop: "keep and drop (loop 3)",
  labels_repeats: "labels and repeats (loop 3)",
  presets: "presets (loop 4)",
  rerolls: "rerolls (loop 3)",
  success_counting: "success counting (loop 3)",
};

/** Single cases in covered areas that use syntax a later loop brings. */
const DEFERRED_CASES: Record<string, string> = {
  "limits/dice_per_term_exploding": "exploding dice (loop 3)",
  "limits/repeat_cap": "repeats (loop 3)",
  "limits/explosion_cap_after_other_rolls": "exploding dice (loop 3)",
  "errors/syntax_bare_reroll": "rerolls (loop 3)",
  "errors/undefined_variable": "variables (loop 5)",
  "errors/undefined_variable_suggestion": "variables (loop 5)",
  "errors/undefined_variable_none_defined": "variables (loop 5)",
  "errors/undefined_variable_other_character": "variables (loop 5)",
  "errors/variable_in_division_error": "variables (loop 5)",
  "errors/variable_in_limit_error": "variables (loop 5)",
  "errors/unknown_preset": "presets (loop 4)",
  "errors/unknown_preset_suggestion": "presets (loop 4)",
  "errors/unknown_preset_global_suggestion": "presets (loop 4)",
  "errors/roll_keyword_unknown": "presets (loop 4)",
  "errors/session_word_one_shot": "session words (loop 2)",
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
        const result = roll(fixture.line, dice);
        expect(json(result)).toEqual(key in DIVERGENT ? DIVERGENT[key] : fixture.expected);
        // A roll that finishes (or fails) has used exactly the dice the Rust engine drew.
        if (!(key in DIVERGENT)) expect(dice.remaining()).toBe(0);
      });
    }
  });
}
