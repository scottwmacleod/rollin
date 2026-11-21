import {
  DEFAULT_CHARACTER,
  type GameSystem,
  MAX_CRIT_RANGE,
  MAX_INT,
  MIN_CRIT_RANGE,
  validateCharacterName,
  validatePresetName,
  validateVariableName,
} from "@rollin/engine";

import type { Storage } from "./storage";

export const CHARACTERS_KEY = "characters";

export interface Character {
  name: string;
  vars: Record<string, number>;
  presets: Record<string, string>;
  system?: GameSystem;
  critRange?: number;
}

export interface Rules {
  system?: GameSystem;
  critRange?: number;
}

export const GAME_SYSTEMS: readonly { id: GameSystem; label: string }[] = [
  { id: "dnd5e", label: "D&D 5e" },
];

export const isCritRange = (n: number): boolean =>
  Number.isInteger(n) && n >= MIN_CRIT_RANGE && n <= MAX_CRIT_RANGE;

export interface Roster {
  active: string;
  characters: Character[];
}

export const DEFAULT_ROSTER: Roster = {
  active: DEFAULT_CHARACTER,
  characters: [{ name: DEFAULT_CHARACTER, vars: {}, presets: {} }],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface Tally {
  skipped: number;
}

function cleanCharacter(value: unknown, tally?: Tally): Character | null {
  if (!isRecord(value) || typeof value.name !== "string" || value.name === "") return null;
  const checked = validateCharacterName(value.name);
  if (!("name" in checked)) {
    if (tally) tally.skipped += 1;
    return null;
  }
  const vars: Record<string, number> = {};
  if (isRecord(value.vars)) {
    for (const [name, n] of Object.entries(value.vars)) {
      if (typeof n !== "number" || !Number.isSafeInteger(n) || Math.abs(n) > MAX_INT) continue;
      const stored = validateVariableName(name);
      if (stored === null) {
        if (tally) tally.skipped += 1;
      } else if (!Object.hasOwn(vars, stored)) vars[stored] = n;
    }
  }
  const presets: Record<string, string> = {};
  if (isRecord(value.presets)) {
    for (const [name, formula] of Object.entries(value.presets)) {
      if (typeof formula !== "string") continue;
      const stored = validatePresetName(name);
      if (!("name" in stored)) {
        if (tally) tally.skipped += 1;
      } else if (!Object.hasOwn(presets, stored.name)) presets[stored.name] = formula;
    }
  }
  const system = GAME_SYSTEMS.find((g) => g.id === value.system)?.id;
  const critRange =
    typeof value.critRange === "number" && isCritRange(value.critRange) && value.critRange < 20
      ? value.critRange
      : undefined;
  return {
    name: checked.name,
    vars,
    presets,
    ...(system ? { system } : {}),
    ...(critRange ? { critRange } : {}),
  };
}

export function cleanCharacters(list: unknown, tally?: Tally): Character[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const characters: Character[] = [];
  for (const raw of list) {
    const character = cleanCharacter(raw, tally);
    if (character === null || seen.has(character.name)) continue;
    seen.add(character.name);
    characters.push(character);
  }
  return characters;
}

export function cleanRoster(value: unknown, tally?: Tally): Roster {
  if (!isRecord(value)) return DEFAULT_ROSTER;
  const characters = cleanCharacters(value.characters, tally);
  if (characters.length === 0) return DEFAULT_ROSTER;
  const wanted = typeof value.active === "string" ? value.active.toLowerCase() : "";
  const active = characters.some((c) => c.name === wanted)
    ? wanted
    : (characters[0] as Character).name;
  return { active, characters };
}

export function activeCharacter(roster: Roster): Character {
  return (roster.characters.find((c) => c.name === roster.active) ??
    roster.characters[0]) as Character;
}

export function sortedCharacters(roster: Roster): Character[] {
  return [...roster.characters].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function sortedVars(character: Character): [name: string, value: number][] {
  return Object.entries(character.vars).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const mapCharacter = (
  roster: Roster,
  name: string,
  change: (c: Character) => Character,
): Roster => ({
  ...roster,
  characters: roster.characters.map((c) => (c.name === name ? change(c) : c)),
});

export function addCharacter(roster: Roster, name: string): Roster {
  if (roster.characters.some((c) => c.name === name)) return { ...roster, active: name };
  return {
    active: name,
    characters: [...roster.characters, { name, vars: {}, presets: {} }],
  };
}

export function setCharacterRules(roster: Roster, name: string, rules: Rules): Roster {
  return mapCharacter(roster, name, ({ system: _s, critRange: _c, ...rest }) => ({
    ...rest,
    ...(rules.system ? { system: rules.system } : {}),
    ...(rules.critRange !== undefined && rules.critRange < MAX_CRIT_RANGE
      ? { critRange: rules.critRange }
      : {}),
  }));
}

export function renameCharacter(roster: Roster, from: string, to: string): Roster {
  if (from === to || roster.characters.some((c) => c.name === to)) return roster;
  if (!roster.characters.some((c) => c.name === from)) return roster;
  return {
    active: roster.active === from ? to : roster.active,
    characters: roster.characters.map((c) => (c.name === from ? { ...c, name: to } : c)),
  };
}

export function removeCharacter(roster: Roster, name: string): Roster {
  if (roster.characters.length <= 1) return roster;
  const characters = roster.characters.filter((c) => c.name !== name);
  if (characters.length === roster.characters.length) return roster;
  const active =
    roster.active === name
      ? (sortedCharacters({ ...roster, characters })[0] as Character).name
      : roster.active;
  return { active, characters };
}

export function switchCharacter(roster: Roster, name: string): Roster {
  return roster.characters.some((c) => c.name === name) ? { ...roster, active: name } : roster;
}

export function setVariable(
  roster: Roster,
  character: string,
  name: string,
  value: number,
  from: string | null = null,
): Roster {
  return mapCharacter(roster, character, (c) => {
    const vars = { ...c.vars, [name]: value };
    if (from !== null && from !== name) delete vars[from];
    return { ...c, vars };
  });
}

export function removeVariable(roster: Roster, character: string, name: string): Roster {
  return mapCharacter(roster, character, (c) => {
    const vars = { ...c.vars };
    delete vars[name];
    return { ...c, vars };
  });
}

export function setCharacterPreset(
  roster: Roster,
  character: string,
  name: string,
  formula: string,
  from: string | null = null,
): Roster {
  return mapCharacter(roster, character, (c) => {
    const presets = { ...c.presets, [name]: formula };
    if (from !== null && from !== name) delete presets[from];
    return { ...c, presets };
  });
}

export function removeCharacterPreset(roster: Roster, character: string, name: string): Roster {
  return mapCharacter(roster, character, (c) => {
    const presets = { ...c.presets };
    delete presets[name];
    return { ...c, presets };
  });
}

export async function loadRoster(storage: Storage): Promise<Roster> {
  return cleanRoster(await storage.get<Roster>(CHARACTERS_KEY));
}

export async function updateRoster(
  storage: Storage,
  change: (roster: Roster) => Roster,
): Promise<Roster> {
  const next = cleanRoster(change(await loadRoster(storage)));
  await storage.set(CHARACTERS_KEY, next);
  return next;
}
