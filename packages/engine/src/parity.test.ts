/**
 * Replays the fixtures in packages/engine/fixtures/parity (recorded from the
 * former Rust engine, frozen since the Rust was deleted) through the engine.
 * Each case scripts the recorded dice, rolls the line, and expects the same
 * result, the same dice asked for in the same order, and every draw used.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type Draw, roll, scriptedDice } from "./index";

interface Context {
  character?: {
    name: string;
    presets?: Record<string, string>;
    vars?: Record<string, number>;
    system?: "dnd5e";
    crit_range?: number;
  };
  global_presets?: Record<string, string>;
  default_system?: "dnd5e";
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

const FIXTURES = join(__dirname, "../fixtures/parity");

const areas: Area[] = readdirSync(FIXTURES)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as Area);

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

describe("the fixtures stay whole", () => {
  test("every divergent case still exists in the fixtures", () => {
    const names = new Set(areas.flatMap((a) => a.cases.map((c) => `${a.area}/${c.name}`)));
    for (const key of Object.keys(DIVERGENT)) expect(names.has(key), key).toBe(true);
  });

  test("the fixtures hold a real number of cases", () => {
    expect(areas.flatMap((a) => a.cases).length).toBeGreaterThan(50);
  });
});

for (const area of areas) {
  describe(`parity: ${area.area}`, () => {
    test("fixture format is the one this harness reads", () => {
      expect(area.format_version).toBe(1);
    });
    for (const fixture of area.cases) {
      const key = `${area.area}/${fixture.name}`;
      test(fixture.name, () => {
        const dice = scriptedDice(fixture.draws);
        const character = fixture.context?.character;
        const result = roll(fixture.line, dice, {
          globalPresets: fixture.context?.global_presets,
          character: character && {
            name: character.name,
            presets: character.presets,
            vars: character.vars,
            system: character.system,
            critRange: character.crit_range,
          },
          defaultSystem: fixture.context?.default_system,
        });
        expect(json(result)).toEqual(key in DIVERGENT ? DIVERGENT[key] : fixture.expected);
        // A roll that finishes (or fails) has used exactly the dice that were recorded.
        if (!(key in DIVERGENT)) expect(dice.remaining()).toBe(0);
      });
    }
  });
}
