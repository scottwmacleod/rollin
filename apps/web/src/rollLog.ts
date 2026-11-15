import type { Entry } from "./Result";
import type { Storage } from "./storage";

export const ROLL_LOG_KEY = "rollLog";
/** The log keeps this many of the newest rolls. */
export const MAX_ENTRIES = 500;

export function capLog(entries: Entry[]): Entry[] {
  return entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
}

/** The next free entry id: one past the largest saved, so ids never collide with another tab's. */
export function nextEntryId(entries: Entry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
}

export async function loadLog(storage: Storage): Promise<Entry[]> {
  const saved = await storage.get<Entry[]>(ROLL_LOG_KEY);
  return Array.isArray(saved) ? capLog(saved) : [];
}

export function saveLog(storage: Storage, entries: Entry[]): Promise<void> {
  return storage.set(ROLL_LOG_KEY, capLog(entries));
}
