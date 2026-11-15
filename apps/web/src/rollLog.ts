import type { Entry } from "./Result";
import type { Storage } from "./storage";

export const ROLL_LOG_KEY = "rollLog";
/** The log keeps this many of the newest rolls. */
export const MAX_ENTRIES = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True for a saved entry the log can draw: a numeric id, the typed text, and a report shaped like the engine's. */
export function isEntry(value: unknown): value is Entry {
  if (!isObject(value) || typeof value.id !== "number" || typeof value.input !== "string") {
    return false;
  }
  const report = value.report;
  if (!isObject(report)) return false;
  if ("ok" in report) return isObject(report.ok) && Array.isArray(report.ok.rolls);
  return isObject(report.error) && typeof report.error.message === "string";
}

/** The valid entries of whatever was saved or received, capped to the newest. */
export function cleanLog(value: unknown): Entry[] {
  return Array.isArray(value) ? capLog(value.filter(isEntry)) : [];
}

export function capLog(entries: Entry[]): Entry[] {
  return entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
}

/** The next free entry id: one past the largest saved, so ids never collide with another tab's. */
export function nextEntryId(entries: Entry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
}

/** The log with one more roll on the end, its id taken from the log it is added to. */
export function addEntry(entries: Entry[], input: string, report: Entry["report"]): Entry[] {
  return capLog([...entries, { id: nextEntryId(entries), input, report }]);
}

/** The saved log followed by rolls made before it loaded, renumbered to follow the saved ones. */
export function mergeLoaded(saved: Entry[], early: Entry[]): Entry[] {
  const first = nextEntryId(saved);
  return capLog([...saved, ...early.map((e, i) => ({ ...e, id: first + i }))]);
}

export async function loadLog(storage: Storage): Promise<Entry[]> {
  return cleanLog(await storage.get<unknown>(ROLL_LOG_KEY));
}

export function saveLog(storage: Storage, entries: Entry[]): Promise<void> {
  return storage.set(ROLL_LOG_KEY, capLog(entries));
}
