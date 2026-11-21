import type { Character } from "./characters";
import { sortedVars } from "./characters";
import type { PresetEntry } from "./presets";

export type PaletteGroup = "Presets" | "Characters" | "Commands";

export type PaletteCommand =
  | "new-preset"
  | "new-character"
  | "new-variable"
  | "settings"
  | "export"
  | "import"
  | "clear-log";

export type PaletteAction =
  | { type: "roll"; name: string }
  | { type: "switch"; name: string }
  | { type: "edit-preset"; name: string; scope: PresetEntry["scope"] }
  | { type: "edit-character"; name: string }
  | { type: "edit-variable"; name: string }
  | { type: "command"; id: PaletteCommand };

export interface PaletteRow {
  value: string;
  label: string;
  detail?: string;
  group: PaletteGroup;
  disabled?: boolean;
  action: PaletteAction;
  searchOnly?: boolean;
}

export interface PaletteData {
  presets: readonly PresetEntry[];
  characters: readonly string[];
  active: Character;
  hasLog: boolean;
}

export function paletteRows(data: PaletteData): PaletteRow[] {
  const commands: PaletteRow[] = [
    { id: "new-preset", label: "New preset…" },
    { id: "new-character", label: "New character…" },
    { id: "new-variable", label: "New variable…" },
    { id: "export", label: "Export backup" },
    { id: "import", label: "Import backup…" },
    { id: "settings", label: "Settings" },
    { id: "clear-log", label: "Clear roll log", disabled: !data.hasLog },
  ].map(({ id, label, disabled }) => ({
    value: `command:${id}`,
    label,
    group: "Commands",
    disabled,
    action: { type: "command", id: id as PaletteCommand },
  }));
  const edits: PaletteRow[] = [
    ...data.presets.map((p): PaletteRow => ({
      value: `edit-preset:${p.name}`,
      label: `Edit preset ${p.name}`,
      group: "Commands",
      searchOnly: true,
      action: { type: "edit-preset", name: p.name, scope: p.scope },
    })),
    {
      value: `edit-character:${data.active.name}`,
      label: `Edit character ${data.active.name}`,
      group: "Commands",
      searchOnly: true,
      action: { type: "edit-character", name: data.active.name },
    },
    ...sortedVars(data.active).map(([name, value]): PaletteRow => ({
      value: `edit-variable:${name}`,
      label: `Edit variable @${name}`,
      detail: String(value),
      group: "Commands",
      searchOnly: true,
      action: { type: "edit-variable", name },
    })),
  ];
  return [
    ...data.presets.map((p): PaletteRow => ({
      value: `roll:${p.name}`,
      label: p.name,
      detail: p.formula,
      group: "Presets",
      action: { type: "roll", name: p.name },
    })),
    ...data.characters.map((name): PaletteRow => ({
      value: `switch:${name}`,
      label: name,
      detail: name === data.active.name ? "active" : undefined,
      group: "Characters",
      searchOnly: true,
      action: { type: "switch", name },
    })),
    ...commands,
    ...edits,
  ];
}

export type PaletteScope = "all" | "characters" | "commands";

export function parseQuery(query: string): { scope: PaletteScope; term: string } {
  if (query.startsWith("@")) return { scope: "characters", term: query.slice(1).trim() };
  if (query.startsWith(">")) return { scope: "commands", term: query.slice(1).trim() };
  return { scope: "all", term: query.trim() };
}

export function matchScore(label: string, term: string): number | null {
  const l = label.toLowerCase();
  const t = term.toLowerCase();
  if (t === "") return 0;
  if (l.startsWith(t)) return 0;
  const at = l.indexOf(t);
  if (at > 0 && /[^a-z0-9]/u.test(l[at - 1] ?? "")) return 1;
  if (at >= 0) return 2;
  let i = 0;
  for (const c of l) if (c === t[i]) i += 1;
  return i === t.length ? 3 : null;
}

export interface PaletteView {
  scope: PaletteScope;
  rows: PaletteRow[];
}

const GROUP_ORDER: PaletteGroup[] = ["Presets", "Characters", "Commands"];
const IN_SCOPE: Record<PaletteScope, PaletteGroup[]> = {
  all: GROUP_ORDER,
  characters: ["Characters"],
  commands: ["Commands"],
};

export function paletteView(rows: readonly PaletteRow[], query: string): PaletteView {
  const { scope, term } = parseQuery(query);
  const shown = rows
    .filter((row) => IN_SCOPE[scope].includes(row.group))
    .filter((row) => !row.searchOnly || term !== "" || scope === "characters")
    .map((row, i) => ({ row, i, score: matchScore(row.label, term) }))
    .filter((r): r is { row: PaletteRow; i: number; score: number } => r.score !== null);
  const rank = (group: PaletteGroup) => GROUP_ORDER.indexOf(group);
  shown.sort((a, b) => rank(a.row.group) - rank(b.row.group) || a.score - b.score || a.i - b.i);
  return { scope, rows: shown.map((r) => r.row) };
}
