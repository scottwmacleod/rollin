import type { Storage } from "./storage";

export const PRESETS_KEY = "globalPresets";

/** Saved presets: stored (lowercase) name to formula. */
export type PresetMap = Record<string, string>;

/** Keeps only name-to-text pairs, so a hand-edited or old save can't break the sidebar. */
export function cleanPresets(value: unknown): PresetMap {
  const out: PresetMap = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  for (const [name, formula] of Object.entries(value)) {
    if (typeof formula === "string") out[name] = formula;
  }
  return out;
}

/** The presets in name order, as the Rust engine lists them. */
export function sortedPresets(presets: PresetMap): [name: string, formula: string][] {
  return Object.entries(presets).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export async function loadPresets(storage: Storage): Promise<PresetMap> {
  return cleanPresets(await storage.get<PresetMap>(PRESETS_KEY));
}

/**
 * Changes the saved presets. It reads what is saved just before writing, so a
 * preset another tab saved a moment ago is kept, not overwritten. Returns what
 * was saved.
 */
export async function updatePresets(
  storage: Storage,
  change: (presets: PresetMap) => PresetMap,
): Promise<PresetMap> {
  const next = change(await loadPresets(storage));
  await storage.set(PRESETS_KEY, next);
  return next;
}
