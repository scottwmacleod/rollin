import type { Entry } from "./Result";
import type { Storage } from "./storage";

export const ROLL_LOG_KEY = "rollLog";
export const MAX_ENTRIES = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEntry(value: unknown): value is Entry {
  if (!isObject(value) || typeof value.id !== "number" || typeof value.input !== "string") {
    return false;
  }
  const report = value.report;
  if (!isObject(report)) return false;
  if ("ok" in report) return isObject(report.ok) && Array.isArray(report.ok.rolls);
  return isObject(report.error) && typeof report.error.message === "string";
}

export function cleanLog(value: unknown): Entry[] {
  return Array.isArray(value) ? capLog(value.filter(isEntry)) : [];
}

export function capLog(entries: Entry[]): Entry[] {
  return entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
}

export function nextEntryId(entries: Entry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
}

export function addEntry(entries: Entry[], input: string, report: Entry["report"]): Entry[] {
  return capLog([...entries, { id: nextEntryId(entries), input, report }]);
}

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
