import { expect, test } from "vitest";
import {
  activeCharacter,
  addCharacter,
  CHARACTERS_KEY,
  cleanRoster,
  DEFAULT_ROSTER,
  loadRoster,
  removeCharacter,
  removeVariable,
  renameCharacter,
  setCharacterPreset,
  setCharacterRules,
  setVariable,
  switchCharacter,
  updateRoster,
} from "./characters";
import { effectivePresets } from "./presets";
import { memoryStorage } from "./storage";

test("a roster always has a character and an active one", () => {
  expect(cleanRoster(undefined)).toEqual(DEFAULT_ROSTER);
  expect(cleanRoster({ active: "x", characters: [] })).toEqual(DEFAULT_ROSTER);
  const roster = cleanRoster({
    active: "gone",
    characters: [
      { name: "aria", vars: { str: 3, bad: "x", huge: 1e300 }, presets: { hit: "d20", no: 4 } },
      { name: "aria" },
      { name: "" },
      7,
    ],
  });
  expect(roster).toEqual({
    active: "aria",
    characters: [{ name: "aria", vars: { str: 3 }, presets: { hit: "d20" } }],
  });
});

test("creating a character switches to it; the last one is never deleted", () => {
  let roster = addCharacter(DEFAULT_ROSTER, "aria");
  expect(roster.active).toBe("aria");
  roster = removeCharacter(roster, "aria");
  expect(roster.active).toBe("default");
  expect(removeCharacter(roster, "default")).toBe(roster);
});

test("renaming keeps the active character active and refuses a taken name", () => {
  const roster = addCharacter(DEFAULT_ROSTER, "aria");
  expect(renameCharacter(roster, "aria", "bo").active).toBe("bo");
  expect(renameCharacter(roster, "aria", "default")).toBe(roster);
});

test("variables and presets belong to one character", () => {
  let roster = addCharacter(DEFAULT_ROSTER, "aria");
  roster = setVariable(roster, "aria", "str", 3);
  roster = setCharacterPreset(roster, "aria", "hit", "d20+@str");
  expect(activeCharacter(roster)).toEqual({
    name: "aria",
    vars: { str: 3 },
    presets: { hit: "d20+@str" },
  });
  expect(activeCharacter(switchCharacter(roster, "default")).vars).toEqual({});
  roster = setVariable(roster, "aria", "strength", 3, "str");
  expect(activeCharacter(roster).vars).toEqual({ strength: 3 });
  expect(activeCharacter(removeVariable(roster, "aria", "strength")).vars).toEqual({});
});

test("a character's preset shadows a global one of the same name", () => {
  expect(effectivePresets({ hit: "d20", zap: "d4" }, { hit: "d20+5", axe: "d12" })).toEqual([
    { name: "axe", formula: "d12", scope: "character" },
    { name: "hit", formula: "d20+5", scope: "character" },
    { name: "zap", formula: "d4", scope: "global" },
  ]);
});

test("updateRoster builds on what is saved, so another tab's character survives", async () => {
  const storage = memoryStorage();
  await storage.set(CHARACTERS_KEY, addCharacter(DEFAULT_ROSTER, "aria"));
  const saved = await updateRoster(storage, (r) => addCharacter(r, "bo"));
  expect(saved.characters.map((c) => c.name)).toEqual(["default", "aria", "bo"]);
  expect(await loadRoster(storage)).toEqual(saved);
});

test("a character's game system and crit range are kept, cleaned and cleared", () => {
  let roster = addCharacter(DEFAULT_ROSTER, "aria");
  roster = setCharacterRules(roster, "aria", { system: "dnd5e", critRange: 19 });
  expect(activeCharacter(roster)).toMatchObject({ system: "dnd5e", critRange: 19 });
  // They survive a rename and a save and load.
  roster = renameCharacter(roster, "aria", "bryn");
  expect(cleanRoster(JSON.parse(JSON.stringify(roster)))).toEqual(roster);
  // The default range (20) is left out, and bad saved values are dropped.
  expect(
    setCharacterRules(roster, "bryn", { system: "dnd5e", critRange: 20 }).characters[1],
  ).toEqual({ name: "bryn", vars: {}, presets: {}, system: "dnd5e" });
  const messy = cleanRoster({
    characters: [
      { name: "x", system: "pf2e", critRange: 1 },
      { name: "y", critRange: 2.5 },
    ],
  });
  expect(messy.characters).toEqual([
    { name: "x", vars: {}, presets: {} },
    { name: "y", vars: {}, presets: {} },
  ]);
  expect(setCharacterRules(roster, "bryn", {}).characters[1]).toEqual({
    name: "bryn",
    vars: {},
    presets: {},
  });
});
