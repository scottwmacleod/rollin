import { validateCharacterName, validatePresetName } from "@rollin/engine";
import {
  CHARACTERS_KEY,
  type Character,
  cleanCharacters,
  cleanRoster,
  loadRoster,
  type Roster,
} from "./characters";
import { cleanPresets, loadPresets, PRESETS_KEY, type PresetMap } from "./presets";
import type { Entry } from "./Result";
import { capLog, ROLL_LOG_KEY } from "./rollLog";
import { parseSettings, SETTINGS_KEY, type Settings } from "./settings";
import type { Storage } from "./storage";

/** Marks a file as a rollin backup, so a stray JSON file is refused with a clear reason. */
export const BACKUP_FORMAT = "rollin-backup";
/** The newest format this build writes and reads. Bump it with an entry in `UPGRADES`. */
export const CURRENT_VERSION = 2;

/** Everything a backup holds. The roll log is optional. */
export interface BackupData {
  characters: Roster;
  globalPresets: PresetMap;
  settings: Settings;
  rollLog?: Entry[];
}

/** What a partial file holds. Every section is optional, but one must have something in it. */
export interface PartialData {
  /** Characters only: a partial file has no active character. */
  characters?: Character[];
  globalPresets?: PresetMap;
}

/** A full backup: everything, with an active character. Replace works only with this kind. */
export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  kind: "full";
  exportedAt: string;
  data: BackupData;
}

/** A partial file: only some characters and global presets. */
export interface PartialFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  kind: "partial";
  exportedAt: string;
  data: PartialData;
}

/** A partial file as written to disk, where the characters sit in a list inside `characters`, as in a full backup. */
export interface PartialFileJson {
  format: typeof BACKUP_FORMAT;
  version: number;
  kind: "partial";
  exportedAt: string;
  data: { characters?: { characters: Character[] }; globalPresets?: PresetMap };
}

/** What `parseBackup` returns; `kind` tells the two apart. */
export type ParsedFile = Backup | PartialFile;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type Upgrades = Record<number, (file: Json) => Json>;

/**
 * One step per past version: `UPGRADES[n]` turns a version `n` file into a
 * version `n + 1` file. Importing walks the steps from the file's version to
 * the current one, so a file from any past version still opens.
 */
const UPGRADES: Upgrades = {
  // Version 1 files were always full backups, so only the kind marker is new.
  1: (file) => ({ ...file, version: 2, kind: "full" }),
};

export type ParseResult = { ok: true; backup: ParsedFile } | { ok: false; error: string };

const fail = (error: string): ParseResult => ({ ok: false, error });

/** Reads the text of a backup file: validates it, upgrades it, and cleans what it holds. */
export function parseBackup(
  text: string,
  current: number = CURRENT_VERSION,
  upgrades: Upgrades = UPGRADES,
): ParseResult {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return fail("That file isn't valid JSON, so it can't be a rollin backup.");
  }
  if (!isRecord(file) || file.format !== BACKUP_FORMAT) {
    return fail("That file isn't a rollin backup.");
  }
  let version = file.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return fail("That backup has no usable version number.");
  }
  if (version > current) {
    return fail(
      `That backup is from a newer rollin (format ${version}); this one reads up to ${current}. Reload to get the latest rollin and try again.`,
    );
  }
  let upgraded: Json = file;
  while (version < current) {
    const step = upgrades[version];
    if (step === undefined) return fail(`That backup's format (${version}) isn't supported.`);
    upgraded = step(upgraded);
    version += 1;
  }
  const exportedAt = typeof upgraded.exportedAt === "string" ? upgraded.exportedAt : "";
  const data = upgraded.data;
  if (upgraded.kind === "full") {
    if (!isRecord(data) || !isRecord(data.characters)) {
      return fail("That backup is missing its characters, so it can't be read.");
    }
    const clean: BackupData = {
      characters: cleanRoster(data.characters),
      globalPresets: cleanPresets(data.globalPresets),
      settings: parseSettings(data.settings),
    };
    if (Array.isArray(data.rollLog)) {
      clean.rollLog = capLog(
        data.rollLog.filter(
          (e): e is Entry => isRecord(e) && typeof e.id === "number" && typeof e.input === "string",
        ),
      );
    }
    return {
      ok: true,
      backup: { format: BACKUP_FORMAT, version: current, kind: "full", exportedAt, data: clean },
    };
  }
  if (upgraded.kind === "partial") {
    // Settings, the roll log and the active character only mean something in a full backup.
    const partial = cleanPartial(data);
    if (partial === null) {
      return fail(
        "That partial file holds no characters or global presets, so there is nothing to read.",
      );
    }
    return {
      ok: true,
      backup: {
        format: BACKUP_FORMAT,
        version: current,
        kind: "partial",
        exportedAt,
        data: partial,
      },
    };
  }
  return fail('That backup\'s kind must be "full" or "partial".');
}

/** Cleans a partial file's data; null when it holds no characters and no global presets. */
function cleanPartial(data: unknown): PartialData | null {
  if (!isRecord(data)) return null;
  const partial: PartialData = {};
  const characters = cleanCharacters(
    isRecord(data.characters) ? data.characters.characters : undefined,
  );
  if (characters.length > 0) partial.characters = characters;
  const globalPresets = cleanPresets(data.globalPresets);
  if (Object.keys(globalPresets).length > 0) partial.globalPresets = globalPresets;
  return partial.characters || partial.globalPresets ? partial : null;
}

/** Reads everything saved into a backup. The roll log goes in only when asked for. */
export async function buildBackup(
  storage: Storage,
  options: { rollLog: boolean; now?: Date },
): Promise<Backup> {
  const data: BackupData = {
    characters: cleanRoster(await storage.get(CHARACTERS_KEY)),
    globalPresets: cleanPresets(await storage.get(PRESETS_KEY)),
    settings: parseSettings(await storage.get(SETTINGS_KEY)),
  };
  if (options.rollLog) {
    const log = await storage.get<Entry[]>(ROLL_LOG_KEY);
    data.rollLog = Array.isArray(log) ? capLog(log) : [];
  }
  return {
    format: BACKUP_FORMAT,
    version: CURRENT_VERSION,
    kind: "full",
    exportedAt: (options.now ?? new Date()).toISOString(),
    data,
  };
}

/** Writes a version 2 partial file from what the caller picked. An empty pick has nothing to write, so it is a mistake. */
export function buildPartial(data: PartialData, now: Date = new Date()): PartialFileJson {
  const characters = data.characters ?? [];
  const globalPresets = data.globalPresets ?? {};
  if (characters.length === 0 && Object.keys(globalPresets).length === 0) {
    throw new Error("A partial file needs at least one character or global preset.");
  }
  return {
    format: BACKUP_FORMAT,
    version: CURRENT_VERSION,
    kind: "partial",
    exportedAt: now.toISOString(),
    data: {
      ...(characters.length > 0 ? { characters: { characters } } : {}),
      ...(Object.keys(globalPresets).length > 0 ? { globalPresets } : {}),
    },
  };
}

/** Replaces saved data with the backup's. A roll log the file doesn't carry is left as it is. */
export async function applyBackup(storage: Storage, backup: Backup): Promise<void> {
  const { data } = backup;
  await storage.set(CHARACTERS_KEY, data.characters);
  await storage.set(PRESETS_KEY, data.globalPresets);
  await storage.set(SETTINGS_KEY, data.settings);
  if (data.rollLog !== undefined) await storage.set(ROLL_LOG_KEY, data.rollLog);
}

// --- Add -------------------------------------------------------------------

/** What Add brings in: characters and global presets, from a full or a partial file. */
export interface Incoming {
  characters: Character[];
  globalPresets: PresetMap;
}

/** What Add compares the file against. */
export interface Saved {
  roster: Roster;
  globalPresets: PresetMap;
}

/** What to do with an item whose name is already saved with different content. */
export type Choice = "keep-mine" | "take-theirs" | "keep-both";

/** A character or global preset in the file that has the same name as a saved one but different content. */
export interface Clash {
  kind: "character" | "preset";
  name: string;
}

/** One choice per clash, by name. Characters and global presets are separate. */
export interface Choices {
  characters: Record<string, Choice>;
  presets: Record<string, Choice>;
}

/** What Add did, for the summary. A "kept both" copy counts as added and as renamed. */
export interface AddCounts {
  charactersAdded: number;
  presetsAdded: number;
  charactersRenamed: number;
  presetsRenamed: number;
  charactersReplaced: number;
  presetsReplaced: number;
  charactersKept: number;
  presetsKept: number;
}

export interface AddResult {
  roster: Roster;
  globalPresets: PresetMap;
  counts: AddCounts;
}

/** The characters and global presets a file contributes to Add; settings, roll log and active character are left behind. */
export function incomingOf(file: ParsedFile): Incoming {
  return file.kind === "full"
    ? { characters: file.data.characters.characters, globalPresets: file.data.globalPresets }
    : { characters: file.data.characters ?? [], globalPresets: file.data.globalPresets ?? {} };
}

/** Deep equality for cleaned JSON values. Object key order doesn't matter; a missing key equals `undefined`. */
function sameContent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameContent(item, b[i]))
    );
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => sameContent(a[key], b[key]));
  }
  return false;
}

/** The clashes Add has to ask about, characters first, in the file's order. Same name with the same content is skipped silently. */
export function listClashes(saved: Saved, incoming: Incoming): Clash[] {
  const clashes: Clash[] = [];
  for (const character of incoming.characters) {
    const mine = saved.roster.characters.find((c) => c.name === character.name);
    if (mine && !sameContent(mine, character)) {
      clashes.push({ kind: "character", name: character.name });
    }
  }
  for (const [name, formula] of Object.entries(incoming.globalPresets)) {
    if (Object.hasOwn(saved.globalPresets, name) && saved.globalPresets[name] !== formula) {
      clashes.push({ kind: "preset", name });
    }
  }
  return clashes;
}

const MAX_GENERATED_NAME = 64;

/**
 * The first free `name-2`, `name-3`, ... that passes the engine's name rules.
 * A name that can't take a suffix as it is (spaces, a long name) is tidied
 * first: lowercased, other characters turned into `-`, and cut short.
 */
export function freeName(
  name: string,
  taken: ReadonlySet<string>,
  validate: (raw: string) => { name: string } | { error: unknown },
): string {
  const tidy = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/, "");
  for (const base of [name, tidy, "copy"]) {
    for (let n = 2; n < 10_000; n += 1) {
      const suffix = `-${n}`;
      const candidate = `${base.slice(0, MAX_GENERATED_NAME - suffix.length)}${suffix}`;
      const checked = validate(candidate);
      if ("name" in checked && !taken.has(checked.name) && !taken.has(candidate)) {
        return checked.name;
      }
    }
  }
  throw new Error("No free name found.");
}

/**
 * Adds the file's characters and global presets to saved ones. New names come
 * in; a clash follows its choice (a clash with no choice keeps yours); an
 * identical item is skipped. The active character is never changed.
 */
export function mergeAdd(saved: Saved, incoming: Incoming, choices: Choices): AddResult {
  const counts: AddCounts = {
    charactersAdded: 0,
    presetsAdded: 0,
    charactersRenamed: 0,
    presetsRenamed: 0,
    charactersReplaced: 0,
    presetsReplaced: 0,
    charactersKept: 0,
    presetsKept: 0,
  };
  const characters = [...saved.roster.characters];
  const takenCharacters = new Set([
    ...characters.map((c) => c.name),
    ...incoming.characters.map((c) => c.name),
  ]);
  for (const character of incoming.characters) {
    const index = characters.findIndex((c) => c.name === character.name);
    const mine = characters[index];
    if (mine === undefined) {
      characters.push(character);
      counts.charactersAdded += 1;
    } else if (!sameContent(mine, character)) {
      const choice = choices.characters[character.name] ?? "keep-mine";
      if (choice === "take-theirs") {
        characters[index] = character;
        counts.charactersReplaced += 1;
      } else if (choice === "keep-both") {
        const name = freeName(character.name, takenCharacters, validateCharacterName);
        takenCharacters.add(name);
        characters.push({ ...character, name });
        counts.charactersAdded += 1;
        counts.charactersRenamed += 1;
      } else counts.charactersKept += 1;
    }
  }
  const globalPresets: PresetMap = { ...saved.globalPresets };
  const takenPresets = new Set([
    ...Object.keys(globalPresets),
    ...Object.keys(incoming.globalPresets),
  ]);
  for (const [name, formula] of Object.entries(incoming.globalPresets)) {
    if (!Object.hasOwn(globalPresets, name)) {
      globalPresets[name] = formula;
      counts.presetsAdded += 1;
    } else if (globalPresets[name] !== formula) {
      const choice = choices.presets[name] ?? "keep-mine";
      if (choice === "take-theirs") {
        globalPresets[name] = formula;
        counts.presetsReplaced += 1;
      } else if (choice === "keep-both") {
        const free = freeName(name, takenPresets, validatePresetName);
        takenPresets.add(free);
        globalPresets[free] = formula;
        counts.presetsAdded += 1;
        counts.presetsRenamed += 1;
      } else counts.presetsKept += 1;
    }
  }
  return { roster: { active: saved.roster.active, characters }, globalPresets, counts };
}

/**
 * Adds the file's items to what is saved. It reads what is saved just before
 * writing, so a change another tab made a moment ago is kept. Returns what is
 * now saved, with the counts.
 */
export async function applyAdd(
  storage: Storage,
  incoming: Incoming,
  choices: Choices,
): Promise<AddResult> {
  const saved: Saved = {
    roster: await loadRoster(storage),
    globalPresets: await loadPresets(storage),
  };
  const result = mergeAdd(saved, incoming, choices);
  const c = result.counts;
  if (c.charactersAdded + c.charactersReplaced > 0)
    await storage.set(CHARACTERS_KEY, result.roster);
  if (c.presetsAdded + c.presetsReplaced > 0) await storage.set(PRESETS_KEY, result.globalPresets);
  return result;
}

/** Counts a person can read after Add, e.g. "Added 2 characters and 1 global preset; kept 1 of yours." */
export function describeAdd(c: AddCounts): string {
  const list = (characters: number, presets: number) =>
    [
      characters > 0 ? plural(characters, "character") : "",
      presets > 0 ? plural(presets, "global preset") : "",
    ].filter(Boolean);
  const parts: string[] = [];
  const added = list(c.charactersAdded, c.presetsAdded);
  if (added.length > 0) {
    const renamed = c.charactersRenamed + c.presetsRenamed;
    parts.push(
      `Added ${added.join(" and ")}${renamed > 0 ? ` (${renamed} under a new name)` : ""}`,
    );
  }
  const replaced = list(c.charactersReplaced, c.presetsReplaced);
  if (replaced.length > 0) parts.push(`replaced ${replaced.join(" and ")} with the file's`);
  const kept = c.charactersKept + c.presetsKept;
  if (kept > 0) parts.push(`kept ${kept} of yours`);
  if (parts.length === 0) return "Nothing to add. You already have everything in that file.";
  const text = parts.join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export interface Summary {
  characters: number;
  variables: number;
  presets: number;
  globalPresets: number;
  rollLog: number | null;
}

function count(characters: Character[], globalPresets: PresetMap, rollLog: number | null): Summary {
  return {
    characters: characters.length,
    variables: characters.reduce((n, c) => n + Object.keys(c.vars).length, 0),
    presets: characters.reduce((n, c) => n + Object.keys(c.presets).length, 0),
    globalPresets: Object.keys(globalPresets).length,
    rollLog,
  };
}

/** Counts, for the "this will replace your data" prompt. */
export function summarise(data: BackupData): Summary {
  return count(
    data.characters.characters,
    data.globalPresets,
    data.rollLog === undefined ? null : data.rollLog.length,
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Counts for a partial file; a section it leaves out counts as none. */
export function describePartialSummary(data: PartialData): string {
  return describeSummary(count(data.characters ?? [], data.globalPresets ?? {}, null));
}

export function describeSummary(s: Summary): string {
  const parts = [
    plural(s.characters, "character"),
    plural(s.variables, "variable"),
    plural(s.presets, "character preset"),
    plural(s.globalPresets, "global preset"),
  ];
  if (s.rollLog !== null) parts.push(plural(s.rollLog, "roll log entry", "roll log entries"));
  return parts.join(", ");
}

export function backupFilename(now: Date = new Date()): string {
  return `rollin-backup-${now.toISOString().slice(0, 10)}.json`;
}

// --- Backup reminder -------------------------------------------------------

export const BACKUP_STATE_KEY = "backupState";
const DAY = 86_400_000;
/** How long unsaved data sits before the first nudge. */
export const REMIND_AFTER_MS = 3 * DAY;
/** How long a dismissed nudge stays away. */
export const SNOOZE_MS = 14 * DAY;

/** Remembered on this device only; never part of a backup. */
export interface BackupState {
  /** The data (as `fingerprint` text) as of the last export. */
  exported?: string;
  /** When the data first differed from the last export. */
  unsavedSince?: number;
  dismissedAt?: number;
}

/** The part of the data a backup protects, as text to compare with the last export. */
export function fingerprint(data: BackupData): string {
  return JSON.stringify([data.characters, data.globalPresets, data.settings]);
}

/** There is something worth backing up: a variable or a preset. Theme alone isn't. */
export function hasContent(data: BackupData): boolean {
  const s = summarise(data);
  return s.variables + s.presets + s.globalPresets > 0 || s.characters > 1;
}

/** Updates the clock on unsaved data: starts it when data first differs from the last export, stops it when it matches. */
export function trackState(state: BackupState, data: BackupData, now: number): BackupState {
  const unsaved = hasContent(data) && state.exported !== fingerprint(data);
  if (!unsaved)
    return state.unsavedSince === undefined ? state : { ...state, unsavedSince: undefined };
  return state.unsavedSince === undefined ? { ...state, unsavedSince: now } : state;
}

export function reminderDue(state: BackupState, now: number): boolean {
  if (state.unsavedSince === undefined || now - state.unsavedSince < REMIND_AFTER_MS) return false;
  return state.dismissedAt === undefined || now - state.dismissedAt >= SNOOZE_MS;
}

/** Hands the browser a JSON file to save. */
export function downloadBackup(backup: Backup): void {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFilename();
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
