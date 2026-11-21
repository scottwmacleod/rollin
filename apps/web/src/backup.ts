import { validateCharacterName, validatePresetName } from "@rollin/engine";
import {
  CHARACTERS_KEY,
  type Character,
  cleanCharacters,
  cleanRoster,
  loadRoster,
  type Roster,
  type Tally,
} from "./characters";
import { cleanPresets, loadPresets, PRESETS_KEY, type PresetMap } from "./presets";
import type { Entry } from "./Result";
import { cleanLog, loadLog, ROLL_LOG_KEY } from "./rollLog";
import { parseSettings, SETTINGS_KEY, type Settings } from "./settings";
import type { Storage } from "./storage";

export const BACKUP_FORMAT = "rollin-backup";
export const CURRENT_VERSION = 2;

export interface BackupData {
  characters: Roster;
  globalPresets: PresetMap;
  settings: Settings;
  rollLog?: Entry[];
}

export interface PartialData {
  characters?: Character[];
  globalPresets?: PresetMap;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  kind: "full";
  exportedAt: string;
  data: BackupData;
  skipped?: number;
}

export interface PartialFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  kind: "partial";
  exportedAt: string;
  data: PartialData;
  skipped?: number;
}

export interface PartialFileJson {
  format: typeof BACKUP_FORMAT;
  version: number;
  kind: "partial";
  exportedAt: string;
  data: { characters?: { characters: Character[] }; globalPresets?: PresetMap };
}

export type ParsedFile = Backup | PartialFile;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type Upgrades = Record<number, (file: Json) => Json>;

const UPGRADES: Upgrades = {
  1: (file) => ({ ...file, version: 2, kind: "full" }),
};

export type ParseResult = { ok: true; backup: ParsedFile } | { ok: false; error: string };

const fail = (error: string): ParseResult => ({ ok: false, error });

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
    const tally: Tally = { skipped: 0 };
    const clean: BackupData = {
      characters: cleanRoster(data.characters, tally),
      globalPresets: cleanPresets(data.globalPresets, tally),
      settings: parseSettings(data.settings),
    };
    if (Array.isArray(data.rollLog)) {
      clean.rollLog = cleanLog(data.rollLog);
    }
    return {
      ok: true,
      backup: {
        format: BACKUP_FORMAT,
        version: current,
        kind: "full",
        exportedAt,
        data: clean,
        skipped: tally.skipped,
      },
    };
  }
  if (upgraded.kind === "partial") {
    const tally: Tally = { skipped: 0 };
    const partial = cleanPartial(data, tally);
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
        skipped: tally.skipped,
      },
    };
  }
  return fail('That backup\'s kind must be "full" or "partial".');
}

function cleanPartial(data: unknown, tally: Tally): PartialData | null {
  if (!isRecord(data)) return null;
  const partial: PartialData = {};
  const characters = cleanCharacters(
    isRecord(data.characters) ? data.characters.characters : undefined,
    tally,
  );
  if (characters.length > 0) partial.characters = characters;
  const globalPresets = cleanPresets(data.globalPresets, tally);
  if (Object.keys(globalPresets).length > 0) partial.globalPresets = globalPresets;
  return partial.characters || partial.globalPresets ? partial : null;
}

export async function buildBackup(
  storage: Storage,
  options: { rollLog: boolean; now?: Date },
): Promise<Backup> {
  const data: BackupData = {
    characters: cleanRoster(await storage.get(CHARACTERS_KEY)),
    globalPresets: cleanPresets(await storage.get(PRESETS_KEY)),
    settings: parseSettings(await storage.get(SETTINGS_KEY)),
  };
  if (options.rollLog) data.rollLog = await loadLog(storage);
  return {
    format: BACKUP_FORMAT,
    version: CURRENT_VERSION,
    kind: "full",
    exportedAt: (options.now ?? new Date()).toISOString(),
    data,
  };
}

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

export async function applyBackup(storage: Storage, backup: Backup): Promise<void> {
  const { data } = backup;
  await storage.set(CHARACTERS_KEY, data.characters);
  await storage.set(PRESETS_KEY, data.globalPresets);
  await storage.set(SETTINGS_KEY, data.settings);
  if (data.rollLog !== undefined) await storage.set(ROLL_LOG_KEY, data.rollLog);
}

export interface Incoming {
  characters: Character[];
  globalPresets: PresetMap;
  skipped?: number;
}

export interface Saved {
  roster: Roster;
  globalPresets: PresetMap;
}

export type Choice = "keep-mine" | "take-theirs" | "keep-both";

export interface Clash {
  kind: "character" | "preset";
  name: string;
}

export interface Choices {
  characters: Record<string, Choice>;
  presets: Record<string, Choice>;
}

export interface AddCounts {
  charactersAdded: number;
  presetsAdded: number;
  charactersRenamed: number;
  presetsRenamed: number;
  charactersReplaced: number;
  presetsReplaced: number;
  charactersKept: number;
  presetsKept: number;
  skipped: number;
}

export interface AddResult {
  roster: Roster;
  globalPresets: PresetMap;
  counts: AddCounts;
}

export function incomingOf(file: ParsedFile): Incoming {
  const raw =
    file.kind === "full"
      ? { characters: file.data.characters.characters, globalPresets: file.data.globalPresets }
      : { characters: file.data.characters ?? [], globalPresets: file.data.globalPresets ?? {} };
  let skipped = file.skipped ?? 0;
  const characters: Character[] = [];
  const seenCharacters = new Set<string>();
  for (const character of raw.characters) {
    const checked = validateCharacterName(character.name);
    if (!("name" in checked)) skipped += 1;
    else if (!seenCharacters.has(checked.name)) {
      seenCharacters.add(checked.name);
      characters.push({ ...character, name: checked.name });
    }
  }
  const globalPresets: PresetMap = {};
  for (const [name, formula] of Object.entries(raw.globalPresets)) {
    const checked = validatePresetName(name);
    if (!("name" in checked)) skipped += 1;
    else if (!Object.hasOwn(globalPresets, checked.name)) globalPresets[checked.name] = formula;
  }
  return { characters, globalPresets, skipped };
}

const choiceFor = (map: Record<string, Choice>, name: string): Choice | undefined =>
  Object.hasOwn(map, name) ? map[name] : undefined;

const mapFor = (choices: Choices, clash: Clash) =>
  clash.kind === "character" ? choices.characters : choices.presets;

export function firstUndecided(clashes: Clash[], choices: Choices): number {
  return clashes.findIndex((c) => choiceFor(mapFor(choices, c), c.name) === undefined);
}

export function answerClash(
  clashes: Clash[],
  choices: Choices,
  clash: Clash,
  choice: Choice,
  forRest: boolean,
): Choices {
  const next: Choices = { characters: { ...choices.characters }, presets: { ...choices.presets } };
  const map = mapFor(next, clash);
  map[clash.name] = choice;
  if (forRest) {
    for (const other of clashes) {
      if (other.kind === clash.kind && choiceFor(map, other.name) === undefined) {
        map[other.name] = choice;
      }
    }
  }
  return next;
}

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
      const candidate = `${base}${suffix}`;
      const checked = validate(candidate);
      if ("name" in checked && !taken.has(checked.name) && !taken.has(candidate)) {
        return checked.name;
      }
    }
  }
  throw new Error("No free name found.");
}

export function addToSaved(saved: Saved, incoming: Incoming, choices: Choices): AddResult {
  const counts: AddCounts = {
    charactersAdded: 0,
    presetsAdded: 0,
    charactersRenamed: 0,
    presetsRenamed: 0,
    charactersReplaced: 0,
    presetsReplaced: 0,
    charactersKept: 0,
    presetsKept: 0,
    skipped: incoming.skipped ?? 0,
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
      const choice = choiceFor(choices.characters, character.name) ?? "keep-mine";
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
      const choice = choiceFor(choices.presets, name) ?? "keep-mine";
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

export async function applyAdd(
  storage: Storage,
  incoming: Incoming,
  choices: Choices,
): Promise<AddResult> {
  const saved: Saved = {
    roster: await loadRoster(storage),
    globalPresets: await loadPresets(storage),
  };
  const result = addToSaved(saved, incoming, choices);
  const c = result.counts;
  if (c.presetsAdded + c.presetsReplaced > 0) await storage.set(PRESETS_KEY, result.globalPresets);
  if (c.charactersAdded + c.charactersReplaced > 0)
    await storage.set(CHARACTERS_KEY, result.roster);
  return result;
}

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
  if (c.skipped > 0) {
    parts.push(
      `skipped ${c.skipped} with ${c.skipped === 1 ? "a name" : "names"} rollin can't use`,
    );
  }
  if (parts.length === 0) return "Nothing to add. You already have everything in that file.";
  const text = parts.join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export function describeSkipped(n: number): string {
  return n > 0 ? ` ${plural(n, "name")} rollin can't use ${n === 1 ? "was" : "were"} skipped.` : "";
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

export function summarise(data: BackupData): Summary {
  return count(
    data.characters.characters,
    data.globalPresets,
    data.rollLog === undefined ? null : data.rollLog.length,
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

export function characterFilename(name: string, now: Date = new Date()): string {
  const safe =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unnamed";
  return `rollin-character-${safe}-${now.toISOString().slice(0, 10)}.json`;
}

export const BACKUP_STATE_KEY = "backupState";
const DAY = 86_400_000;
export const REMIND_AFTER_MS = 3 * DAY;
export const SNOOZE_MS = 14 * DAY;

export interface BackupState {
  exported?: string;
  unsavedSince?: number;
  dismissedAt?: number;
}

export function fingerprint(data: BackupData): string {
  return JSON.stringify([data.characters, data.globalPresets, data.settings]);
}

export function hasContent(data: BackupData): boolean {
  const s = summarise(data);
  return s.variables + s.presets + s.globalPresets > 0 || s.characters > 1;
}

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

export function downloadBackup(
  backup: Backup | PartialFileJson,
  filename: string = backupFilename(),
): void {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
