import {
  CHARACTERS_KEY,
  type Character,
  cleanCharacter,
  cleanRoster,
  type Roster,
} from "./characters";
import { cleanPresets, PRESETS_KEY, type PresetMap } from "./presets";
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
export interface PartialBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  kind: "partial";
  exportedAt: string;
  data: PartialData;
}

/** What `parseBackup` returns; `kind` tells the two apart. */
export type ParsedBackup = Backup | PartialBackup;

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

export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: string };

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
  const list = isRecord(data.characters) ? data.characters.characters : undefined;
  if (Array.isArray(list)) {
    const seen = new Set<string>();
    const characters: Character[] = [];
    for (const raw of list) {
      const character = cleanCharacter(raw);
      if (character === null || seen.has(character.name)) continue;
      seen.add(character.name);
      characters.push(character);
    }
    if (characters.length > 0) partial.characters = characters;
  }
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

/** Replaces saved data with the backup's. A roll log the file doesn't carry is left as it is. */
export async function applyBackup(storage: Storage, backup: Backup): Promise<void> {
  const { data } = backup;
  await storage.set(CHARACTERS_KEY, data.characters);
  await storage.set(PRESETS_KEY, data.globalPresets);
  await storage.set(SETTINGS_KEY, data.settings);
  if (data.rollLog !== undefined) await storage.set(ROLL_LOG_KEY, data.rollLog);
}

export interface Summary {
  characters: number;
  variables: number;
  presets: number;
  globalPresets: number;
  rollLog: number | null;
}

/** Counts, for the "this will replace your data" prompt. */
export function summarise(data: BackupData): Summary {
  const { characters } = data.characters;
  return {
    characters: characters.length,
    variables: characters.reduce((n, c) => n + Object.keys(c.vars).length, 0),
    presets: characters.reduce((n, c) => n + Object.keys(c.presets).length, 0),
    globalPresets: Object.keys(data.globalPresets).length,
    rollLog: data.rollLog === undefined ? null : data.rollLog.length,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Counts for a partial file; a section it leaves out counts as none. */
export function describePartialSummary(data: PartialData): string {
  const characters = data.characters ?? [];
  return describeSummary({
    characters: characters.length,
    variables: characters.reduce((n, c) => n + Object.keys(c.vars).length, 0),
    presets: characters.reduce((n, c) => n + Object.keys(c.presets).length, 0),
    globalPresets: Object.keys(data.globalPresets ?? {}).length,
    rollLog: null,
  });
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
