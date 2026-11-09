import type { PresetEntry, SessionState } from "../api/generated";

/** One preset as the sidebar draws it. */
export interface PresetRow {
  entry: PresetEntry;
  scope: "character" | "global";
  /** A global preset hidden behind a character preset of the same name.
   * Rolling its name rolls the character's, so it is dimmed, has no click
   * action and no ⌘ shortcut; it can still be deleted. */
  shadowed: boolean;
  /** 1–9 for the first nine rollable rows, else null. */
  shortcut: number | null;
}

/** Displayed order: the character's presets, then globals. This one list
 * drives both the rows and ⌘1–9, so the two cannot disagree. */
export function presetRows(state: Pick<SessionState, "presets" | "global_presets">): PresetRow[] {
  const rows: PresetRow[] = [
    ...state.presets.map((entry) => ({ entry, scope: "character" as const, shadowed: false })),
    ...state.global_presets.map((entry) => ({
      entry,
      scope: "global" as const,
      shadowed: entry.shadow.kind === "shadowed_by",
    })),
  ].map((r) => ({ ...r, shortcut: null as number | null }));
  let n = 0;
  for (const row of rows) {
    if (!row.shadowed && n < 9) row.shortcut = ++n;
  }
  return rows;
}

/** Command lines for the sidebar's edits. They go through `execute`, so
 * validation and saved data are the CLI's. */
export const commands = {
  setVar: (name: string, value: string) => `set ${name.replace(/^@/, "")} ${value.trim()}`,
  unsetVar: (name: string) => `unset ${name.replace(/^@/, "")}`,
  savePreset: (name: string, formula: string, global: boolean) =>
    `save ${name} ${formula.trim()}${global ? " --global" : ""}`,
  deletePreset: (name: string, global: boolean) => `delete ${name}${global ? " --global" : ""}`,
};
