import { modHint } from "../platform";
import type { Execution, Output, PresetEntry, SessionState } from "../api/types";

/** Rows shown before a menu or the palette list scrolls (28px each). */
export const LIST_ROWS = 8;

/** What the status bar shows for the last thing the app did. */
export interface AppEvent {
  /** `+` added, `~` changed, `−` removed, or empty. */
  glyph: string;
  text: string;
}

const GLYPH: Partial<Record<Output["kind"], string>> = {
  char_created: "+",
  imported: "+",
  char_renamed: "~",
  var_set: "~",
  char_deleted: "−",
  var_unset: "−",
  deleted: "−",
};

/** The status bar's event for a command result. The wording is the library's
 * (`Output.lines`), the same text the CLI prints; this only adds the glyph.
 * Rolls and listings have no event. */
export function eventFor(execution: Execution): AppEvent | null {
  if (execution.status !== "ok") return null;
  const out = execution.output;
  const text = out.lines[0];
  if (text === undefined || out.kind === "rolls") return null;
  const glyph = out.kind === "saved" ? (out.replaced === null ? "+" : "~") : (GLYPH[out.kind] ?? "");
  return { glyph, text };
}

/** How many rolls a result adds to "N rolls this session". */
export function rollsIn(execution: Execution): number {
  return execution.status === "ok" && execution.output.kind === "rolls" ? execution.output.rolls.length : 0;
}

export function failureText(result: Execution): string | null {
  if (result.status === "error") return result.error.message;
  if (result.status === "rejected") return result.message;
  return null;
}

/** The message from a rejected promise (`Failure`), if it has one. */
export function messageOf(failure: unknown): string {
  const f = failure as { error?: { message?: unknown }; message?: unknown } | null;
  if (typeof f?.error?.message === "string") return f.error.message;
  if (typeof f?.message === "string") return f.message;
  return String(failure);
}

export type PaletteScope = "all" | "characters" | "commands";

export type PaletteAction =
  | { type: "roll"; line: string }
  | { type: "run"; line: string }
  | { type: "switch"; name: string }
  | { type: "scope"; prefix: "@" | ">" }
  | { type: "ui"; id: "new-character" | "new-preset" | "clear-log" | "toggle-sidebar" | "set-seed" | "random-seed" };

export interface PaletteRow {
  kind: "preset" | "character" | "command" | "recent" | "tip";
  label: string;
  detail?: string;
  /** Set on preset rows, for ⌘E. */
  preset?: PresetEntry;
  action: PaletteAction;
}

export interface PaletteView {
  scope: PaletteScope;
  /** Group titles keyed by the index of their first row. */
  headings: Map<number, string>;
  rows: PaletteRow[];
}

export const COMMANDS: PaletteRow[] = [
  { kind: "command", label: "New character…", action: { type: "ui", id: "new-character" } },
  { kind: "command", label: "New preset…", action: { type: "ui", id: "new-preset" } },
  { kind: "command", label: "Clear log", action: { type: "ui", id: "clear-log" } },
  {
    kind: "command",
    label: "Toggle sidebar",
    get detail() {
      return modHint("B");
    },
    action: { type: "ui", id: "toggle-sidebar" },
  },
  { kind: "command", label: "Set seed…", action: { type: "ui", id: "set-seed" } },
  { kind: "command", label: "Random seed", action: { type: "ui", id: "random-seed" } },
  { kind: "command", label: "List presets", detail: "presets", action: { type: "run", line: "presets" } },
  { kind: "command", label: "List variables", detail: "vars", action: { type: "run", line: "vars" } },
  { kind: "command", label: "List characters", detail: "characters", action: { type: "run", line: "characters" } },
  { kind: "command", label: "Help", detail: "help", action: { type: "run", line: "help" } },
];

/** Lower is better; null is no match. Prefix, then word start, then
 * substring, then letters in order. */
export function matchScore(label: string, term: string): number | null {
  const l = label.toLowerCase();
  const t = term.toLowerCase();
  if (t === "") return 0;
  if (l.startsWith(t)) return 0;
  const at = l.indexOf(t);
  if (at > 0 && /[^a-z0-9]/.test(l[at - 1] ?? "")) return 1;
  if (at >= 0) return 2;
  let i = 0;
  for (const c of l) if (c === t[i]) i++;
  return i === t.length ? 3 : null;
}

function ranked(rows: PaletteRow[], term: string): PaletteRow[] {
  return rows
    .map((row, i) => ({ row, i, score: matchScore(row.label, term) }))
    .filter((r): r is { row: PaletteRow; i: number; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((r) => r.row);
}

/** `@mira` searches characters, `>new` commands; anything else searches
 * presets and commands. */
export function parseQuery(query: string): { scope: PaletteScope; term: string } {
  if (query.startsWith("@")) return { scope: "characters", term: query.slice(1).trim() };
  if (query.startsWith(">")) return { scope: "commands", term: query.slice(1).trim() };
  return { scope: "all", term: query.trim() };
}

function presetRows(state: SessionState): PaletteRow[] {
  const hidden = new Set(state.global_presets.filter((p) => p.shadow.kind === "shadowed_by").map((p) => p.name));
  return [...state.presets, ...state.global_presets.filter((p) => !hidden.has(p.name))].map((p) => ({
    kind: "preset" as const,
    label: p.name,
    detail: p.formula,
    preset: p,
    action: { type: "roll" as const, line: p.name },
  }));
}

function characterRows(state: SessionState): PaletteRow[] {
  return state.characters.map((name) => ({
    kind: "character" as const,
    label: name,
    detail: name === state.active_character ? "current" : undefined,
    action: { type: "switch" as const, name },
  }));
}

/** Recent lines worth offering again: the last distinct three. */
export function recentLines(history: string[]): string[] {
  const out: string[] = [];
  for (const line of [...history].reverse()) {
    const l = line.trim();
    if (l && !out.includes(l)) out.push(l);
    if (out.length === 3) break;
  }
  return out;
}

const TIPS: PaletteRow[] = [
  { kind: "tip", label: "@ to switch character", detail: "e.g. @mira", action: { type: "scope", prefix: "@" } },
  { kind: "tip", label: "> to run a command", detail: "e.g. >new", action: { type: "scope", prefix: ">" } },
];

/** What the palette lists for `query`. With nothing typed it teaches the
 * scopes: recent lines, then a row per scope that fills the prefix in. */
export function paletteView(state: SessionState, query: string): PaletteView {
  const { scope, term } = parseQuery(query);
  const headings = new Map<number, string>();
  if (scope === "characters") return { scope, headings, rows: ranked(characterRows(state), term) };
  if (scope === "commands") return { scope, headings, rows: ranked(COMMANDS, term) };
  if (term === "") {
    const recent: PaletteRow[] = recentLines(state.history).map((line) => ({
      kind: "recent",
      label: line,
      action: { type: "roll", line },
    }));
    const rows = [...recent, ...TIPS];
    if (recent.length > 0) headings.set(0, "Recent");
    headings.set(recent.length, "Try typing");
    return { scope, headings, rows };
  }
  return { scope, headings, rows: ranked([...presetRows(state), ...COMMANDS], term) };
}
