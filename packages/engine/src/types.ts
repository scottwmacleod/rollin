/**
 * The engine's public data. Shapes match what the Rust engine hands the desktop
 * app (`apps/desktop/src/api/generated.ts`) so the parity fixtures compare as
 * plain JSON. Fields the engine leaves unset are left out, never `undefined`.
 */

/** A UTF-8 byte range into the formula as the engine saw it. */
export interface Span {
  start: number;
  end: number;
}

/** A hard limit that a `limit_exceeded` error can name (ADR-0006). */
export type Cap =
  | "dice_per_term"
  | "explosions_per_die"
  | "rerolls_per_die"
  | "dice_per_roll"
  | "nesting_depth"
  | "repeat";

export type FormulaError =
  | { kind: "syntax"; message: string; span: Span }
  | { kind: "invalid_dice"; message: string; span: Span }
  | { kind: "limit_exceeded"; cap: Cap; limit: number; term: string; span: Span }
  | { kind: "infinite_explosion"; clause: string; sides: number; span: Span }
  | { kind: "infinite_reroll"; clause: string; sides: number; span: Span }
  | { kind: "division_by_zero"; span: Span }
  | { kind: "count_in_arithmetic"; span: Span }
  | { kind: "overflow"; span: Span }
  /** A formula used `@name` and the character has no such variable. `span` is the `@name`. */
  | { kind: "undefined_variable"; name: string; span: Span }
  /** An error whose offending text includes variables: `inner`, plus the values they resolved to. */
  | { kind: "with_variables"; inner: FormulaError; bindings: [name: string, value: number][] }
  | {
      kind: "repeat_without_dice";
      /** The text after the `Nx`, trimmed. */
      body: string;
      /** The formula rewritten with `*` for `x`, when that is unambiguous. */
      multiplication: string | null;
      span: Span;
    };

/** A suggested next step, as data: the front end words it. */
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

export type BinOp = "+" | "-" | "*" | "/";

/** Why a die is in the pool: the clause as written, and the die that caused it. */
export interface Reason {
  /** The clause as written in the term, such as `r1`, `!` or the `dl1` that dropped it. */
  clause: string;
  /** The index in the group's `dice` of the die that caused this one. */
  from?: number;
  /** A second clause that also shaped this die: a compound `!!` on a reroll replacement. */
  also?: string;
}

export interface Die {
  value: number;
  /** `exploded` is an extra die an earlier die set off. `rerolled` is a die a reroll replaced: it never counts. */
  status: "kept" | "dropped" | "exploded" | "rerolled";
  /** For a compounded exploding die (`!!`): the rolls added into `value`, in order. */
  parts?: number[];
  /** Set on a counting die that was a success or a failure. */
  outcome?: "success" | "failure";
  /** Set on the kept die of a d20 check that rolled a natural 20 or a natural 1. */
  natural?: "twenty" | "one";
  reason?: Reason;
}

export type Node =
  | { type: "number"; value: number }
  | {
      type: "dice";
      /** The term as written, such as `2d6`. */
      term: string;
      sides: number;
      /** The modifier clauses as written, such as `>=8f1`. Left out when there are none. */
      modifiers?: string[];
      special?: "percentile";
      dice: Die[];
      /** The sum of the dice, or successes minus failures for a count. */
      subtotal: number;
      /** Present on a success count. */
      kind?: "count";
      successes?: number;
      failures?: number;
    }
  | { type: "neg"; operand: Node; total: number }
  | { type: "group"; inner: Node; total: number }
  | { type: "chain"; first: Node; rest: { op: BinOp; node: Node }[]; total: number };

export interface Roll {
  formula: string;
  /** `count` for a success count; left out for a sum. */
  kind?: "count";
  total: number;
  expr: Node;
  /** The `# text` note on this roll, if it had one. */
  label?: string;
  /** For a repeated formula (`Nx`), which repeat (from 1) this roll is in. */
  iteration?: number;
  /** Under a game system: whether this attack was a critical hit or miss. */
  crit?: "hit" | "miss";
  /** Whether this roll's dice were doubled: by a `crit` suffix, or because its attack was a critical hit. */
  doubled?: boolean;
}

export interface RollsReport {
  kind: "rolls";
  rolls: Roll[];
  hints: Hint[];
  lines: string[];
  /** `[name, formula]` when the line rolled a saved preset, else `null`. */
  preset: [name: string, formula: string] | null;
}

export type ErrorReport =
  | {
      kind: "formula";
      error: FormulaError;
      /** The neutral one-line text. */
      message: string;
      hints: Hint[];
      /** The formula the spans point into. */
      source: string;
    }
  /** A formula used `@name` and the active character has no such variable. */
  | {
      kind: "undefined_variable";
      error: FormulaError;
      name: string;
      character: string;
      /** The character's variable names, sorted. */
      defined: string[];
      /** A defined name within edit distance 2 of the missing one. */
      suggestion: string | null;
      /** Whether the character was chosen by name rather than being the active one. */
      explicit: boolean;
      message: string;
      hints: Hint[];
      /** The formula the spans point into. */
      source: string;
    }
  | { kind: "usage"; message: string; hints: Hint[]; usage: string }
  | {
      kind: "unknown_preset";
      /** The word as typed. */
      word: string;
      /** A saved name within edit distance 2 of the word. */
      suggestion: string | null;
      message: string;
      hints: Hint[];
    };

/** What `roll` returns: the rolls, or why the line could not be rolled. */
export type RollReport = { ok: RollsReport } | { error: ErrorReport };
