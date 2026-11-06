// Wire types for the Tauri commands. They mirror the Rust serialisation of
// `rollin::Output`, `CommandError`, `Hint` and the session types in
// src-tauri/core; keep them in step when those change (src-tauri/core/tests
// pins the Rust side). No behaviour lives here: the library words and decides
// everything, the front end only draws it.

/** Byte range into `source` (UTF-8 bytes, as the library counts). */
export interface Span {
  start: number;
  end: number;
}

export type Hint =
  | { kind: "did_you_mean"; name: string }
  | { kind: "did_you_mean_variable"; name: string }
  | { kind: "list_presets" }
  | { kind: "create_character"; name: string }
  | { kind: "set_variable"; character: string; name: string; explicit: boolean }
  | { kind: "delete_global_preset"; name: string }
  | { kind: "use_help_flag" }
  | { kind: "defined_variables"; names: string[] }
  | { kind: "use_multiplication"; suggestion: string | null }
  | { kind: "add_preset" }
  | { kind: "add_variable" };

export type DieStatus = "kept" | "dropped" | "exploded" | "rerolled";

export interface Die {
  value: number;
  status: DieStatus;
  parts?: number[];
  outcome?: "success" | "failure";
  reason?: { clause: string; from?: number; also?: string };
}

export type Node =
  | { type: "number"; value: number }
  | {
      type: "dice";
      term: string;
      sides: number;
      modifiers?: string[];
      special?: string;
      dice: Die[];
      subtotal: number;
      kind?: "sum" | "count";
      successes?: number;
      failures?: number;
    }
  | { type: "neg"; operand: Node; total: number }
  | { type: "group"; inner: Node; total: number }
  | { type: "chain"; first: Node; rest: { op: string; node: Node }[]; total: number };

export interface Roll {
  formula: string;
  kind?: "count";
  total: number;
  expr: Node;
  label?: string;
  iteration?: number;
}

export type PresetSource = { kind: "character"; name: string } | { kind: "global" };
export type Shadow =
  | { kind: "none" }
  | { kind: "shadows" }
  | { kind: "shadowed_by"; by: string };

export interface PresetEntry {
  name: string;
  formula: string;
  source: PresetSource;
  shadow: Shadow;
}

/** A command's result. `lines` is the library's neutral text; `hints` are next steps. */
export type Output = (
  | { kind: "rolls"; preset: [string, string] | null; rolls: Roll[] }
  | { kind: "saved"; name: string; formula: string; character: string | null; replaced: string | null }
  | { kind: "deleted"; name: string; character: string | null }
  | { kind: "imported"; imported: string[]; skipped: [string, string][] }
  | { kind: "var_unset"; name: string; character: string }
  | { kind: "characters"; names: string[]; active: string }
  | { kind: "active_character"; name: string }
  | { kind: "char_deleted"; name: string; was_active: boolean }
  | { kind: "char_renamed"; from: string; to: string }
  | { kind: "char_created"; name: string }
  | { kind: "char_switched"; name: string }
  | { kind: "vars"; vars: [string, number][] }
  | { kind: "var_set"; name: string; value: number; character: string }
  | { kind: "presets"; presets: PresetEntry[] }
) & { lines: string[]; hints: Hint[] };

/**
 * A command error. `kind` says which; the other fields vary by kind (see
 * `rollin::CommandError`). `message` and `hints` are always there.
 */
export interface CommandError {
  kind: string;
  message: string;
  hints: Hint[];
  [field: string]: unknown;
}

export type Execution =
  | { status: "ok"; output: Output }
  | { status: "error"; error: CommandError; span: Span | null; source: string | null }
  | { status: "text"; lines: string[] }
  | { status: "rejected"; message: string }
  | { status: "quit" }
  | { status: "empty" };

/** What a command that returns `Result` rejects with. */
export type Failure = Extract<Execution, { status: "error" }>;

export interface SessionState {
  active_character: string;
  characters: string[];
  vars: [string, number][];
  presets: PresetEntry[];
  global_presets: PresetEntry[];
  seed: number | null;
  history: string[];
}

export interface Completions {
  /** UTF-16 index into the line, ready for `String.slice`. */
  start: number;
  candidates: string[];
}

/** What the About view shows; built in Rust from the build's own versions. */
export interface About {
  name: string;
  app_version: string;
  library_version: string;
  license: string;
  repository: string;
}
