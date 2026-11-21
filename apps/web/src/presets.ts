import { validatePresetName } from "@rollin/engine";

import type { Tally } from "./characters";
import type { Storage } from "./storage";

export const PRESETS_KEY = "globalPresets";

export type PresetMap = Record<string, string>;

export function cleanPresets(value: unknown, tally?: Tally): PresetMap {
  const out: PresetMap = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  for (const [name, formula] of Object.entries(value)) {
    if (typeof formula !== "string") continue;
    const checked = validatePresetName(name);
    if (!("name" in checked)) {
      if (tally) tally.skipped += 1;
    } else if (!Object.hasOwn(out, checked.name)) out[checked.name] = formula;
  }
  return out;
}

export function sortedPresets(presets: PresetMap): [name: string, formula: string][] {
  return Object.entries(presets).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export type PresetScope = "character" | "global";

export interface PresetEntry {
  name: string;
  formula: string;
  scope: PresetScope;
}

export function effectivePresets(global: PresetMap, own: PresetMap): PresetEntry[] {
  const entries: PresetEntry[] = [
    ...sortedPresets(own).map(([name, formula]): PresetEntry => ({
      name,
      formula,
      scope: "character",
    })),
    ...sortedPresets(global)
      .filter(([name]) => !Object.hasOwn(own, name))
      .map(([name, formula]): PresetEntry => ({ name, formula, scope: "global" })),
  ];
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function loadPresets(storage: Storage): Promise<PresetMap> {
  return cleanPresets(await storage.get<PresetMap>(PRESETS_KEY));
}

export async function updatePresets(
  storage: Storage,
  change: (presets: PresetMap) => PresetMap,
): Promise<PresetMap> {
  const next = change(await loadPresets(storage));
  await storage.set(PRESETS_KEY, next);
  return next;
}
