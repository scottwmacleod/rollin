import { DEFAULT_CHARACTER, MAX_INT } from "@rollin/engine";
import type { Storage } from "./storage";

export const CHARACTERS_KEY = "characters";

/** A character: named integer variables and its own presets. */
export interface Character {
  name: string;
  /** Lowercase variable name to value. */
  vars: Record<string, number>;
  /** Stored (lowercase) preset name to formula. */
  presets: Record<string, string>;
}

/** Every character, and which one is active. Exactly one always is. */
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

function cleanCharacter(value: unknown): Character | null {
  if (!isRecord(value) || typeof value.name !== "string" || value.name === "") return null;
  const vars: Record<string, number> = {};
  if (isRecord(value.vars)) {
    for (const [name, n] of Object.entries(value.vars)) {
      if (typeof n === "number" && Number.isSafeInteger(n) && Math.abs(n) <= MAX_INT)
        vars[name] = n;
    }
  }
  const presets: Record<string, string> = {};
  if (isRecord(value.presets)) {
    for (const [name, formula] of Object.entries(value.presets)) {
      if (typeof formula === "string") presets[name] = formula;
    }
  }
  return { name: value.name, vars, presets };
}

/**
 * Reads a saved roster, dropping anything malformed. Whatever is saved, the
 * result has at least one character and an active one that exists.
 */
export function cleanRoster(value: unknown): Roster {
  if (!isRecord(value) || !Array.isArray(value.characters)) return DEFAULT_ROSTER;
  const seen = new Set<string>();
  const characters: Character[] = [];
  for (const raw of value.characters) {
    const character = cleanCharacter(raw);
    if (character === null || seen.has(character.name)) continue;
    seen.add(character.name);
    characters.push(character);
  }
  if (characters.length === 0) return DEFAULT_ROSTER;
  const active =
    typeof value.active === "string" && seen.has(value.active)
      ? value.active
      : (characters[0] as Character).name;
  return { active, characters };
}

/** The active character. `cleanRoster` guarantees there is one. */
export function activeCharacter(roster: Roster): Character {
  return (roster.characters.find((c) => c.name === roster.active) ??
    roster.characters[0]) as Character;
}

/** Characters in name order. */
export function sortedCharacters(roster: Roster): Character[] {
  return [...roster.characters].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Variables in name order. */
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

/** Adds a character and makes it the active one. A name already taken changes nothing but the active one. */
export function addCharacter(roster: Roster, name: string): Roster {
  if (roster.characters.some((c) => c.name === name)) return { ...roster, active: name };
  return {
    active: name,
    characters: [...roster.characters, { name, vars: {}, presets: {} }],
  };
}

/** Renames a character, keeping the active one active. A taken or unknown name changes nothing. */
export function renameCharacter(roster: Roster, from: string, to: string): Roster {
  if (from === to || roster.characters.some((c) => c.name === to)) return roster;
  if (!roster.characters.some((c) => c.name === from)) return roster;
  return {
    active: roster.active === from ? to : roster.active,
    characters: roster.characters.map((c) => (c.name === from ? { ...c, name: to } : c)),
  };
}

/** Deletes a character. The last one is never deleted; deleting the active one activates the first left. */
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

/** Sets a variable on a character, dropping `from` when it was renamed. */
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

/** Sets one of a character's own presets, dropping `from` when it was renamed. */
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

/**
 * Changes the saved roster. It reads what is saved just before writing, so a
 * change another tab saved a moment ago is kept, not overwritten. Returns what
 * was saved.
 */
export async function updateRoster(
  storage: Storage,
  change: (roster: Roster) => Roster,
): Promise<Roster> {
  const next = cleanRoster(change(await loadRoster(storage)));
  await storage.set(CHARACTERS_KEY, next);
  return next;
}
