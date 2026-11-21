import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { checkFormula, roll, scriptedDice, validatePresetName } from "./index";

describe("preset names follow the Rust rules", () => {
  test.each([
    ["Attack", "attack"],
    ["Fire-ball_2", "fire-ball_2"],
    ["smite", "smite"],
  ])("%s is accepted as %s", (raw, stored) => {
    expect(validatePresetName(raw)).toEqual({ name: stored });
  });

  test.each([
    ["", "shape"],
    ["9lives", "shape"],
    ["_x", "shape"],
    ["has space", "shape"],
    ["héros", "shape"],
    ["save", "command_word"],
    ["ROLL", "command_word"],
    ["kh", "dice_keyword"],
    ["adv", "dice_keyword"],
    ["d6", "parses_as_formula"],
    ["d20", "parses_as_formula"],
    ["d0", "looks_like_dice"],
  ])("%s breaks the %s rule", (raw, rule) => {
    const result = validatePresetName(raw);
    expect("error" in result && result.error.rule).toBe(rule);
  });

  test("the reason names the command words", () => {
    const result = validatePresetName("char");
    expect("error" in result && result.error.reason).toContain("command word (save, presets,");
  });
});

describe("rolling a saved preset", () => {
  const dice = () => scriptedDice([{ sides: 20, face: 7 }]);

  test("a preset rolls by name, in any case, with or without roll", () => {
    for (const line of ["attack", "ATTACK", "roll attack", "Roll Attack"]) {
      const report = roll(line, dice(), { globalPresets: { attack: "d20+5" } });
      expect("ok" in report && report.ok.preset).toEqual(["attack", "d20+5"]);
      expect("ok" in report && report.ok.rolls[0]?.total).toBe(12);
    }
  });

  test("a character's own preset shadows a global one", () => {
    const report = roll("attack", dice(), {
      globalPresets: { attack: "d20+5" },
      character: { name: "hero", presets: { attack: "d20+7" } },
    });
    expect("ok" in report && report.ok.preset).toEqual(["attack", "d20+7"]);
  });

  test("a name that is also a formula rolls as the formula", () => {
    const report = roll("d6", scriptedDice([{ sides: 6, face: 3 }]), {
      globalPresets: { d6: "d20" },
    });
    expect("ok" in report && report.ok.preset).toBeNull();
  });

  test("an unknown name suggests a near match, and nothing for a far one", () => {
    const context = { globalPresets: { fireball: "8d6" } };
    const near = roll("firebal", dice(), context);
    expect("error" in near && near.error).toMatchObject({
      kind: "unknown_preset",
      suggestion: "fireball",
    });
    const far = roll("dodge", dice(), context);
    expect("error" in far && far.error).toMatchObject({ suggestion: null });
  });

  test("a name like constructor is just unknown", () => {
    for (const word of ["constructor", "valueof", "hasownproperty"]) {
      expect(roll(word, dice(), {})).toMatchObject({ error: { kind: "unknown_preset" } });
    }
  });

  test("a saved preset that no longer parses reports its own text", () => {
    const report = roll("bad", dice(), { globalPresets: { bad: "d20+" } });
    expect(report).toMatchObject({ error: { kind: "formula", source: "d20+" } });
  });
});

describe("checkFormula", () => {
  test("accepts a formula and locates the error in a bad one", () => {
    expect(checkFormula("2d6+3 # hit")).toBeNull();
    expect(checkFormula("d20+")?.error.kind).toBe("syntax");
  });
});

describe("preset name properties (from the former Rust property tests)", () => {
  test("an accepted name is lowercase and rolls back by name, in any letter case", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), (raw) => {
        const checked = validatePresetName(raw);
        if (!("name" in checked)) return;
        expect(checked.name).toBe(checked.name.toLowerCase());
        const report = roll(raw, () => 1, { globalPresets: { [checked.name]: "2d6+1" } });
        if ("ok" in report) expect(report.ok.preset).toEqual([checked.name, "2d6+1"]);
      }),
    );
  });

  test("a name that parses as a dice formula is never accepted", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{0,2}[dD][0-9a-zA-Z%]{0,4}$/), (name) => {
        const report = roll(name, () => 1);
        if ("ok" in report) expect("error" in validatePresetName(name)).toBe(true);
      }),
    );
  });
});
