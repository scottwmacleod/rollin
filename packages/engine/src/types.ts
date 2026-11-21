export interface Span {
  start: number;
  end: number;
}

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
  | { kind: "undefined_variable"; name: string; span: Span }
  | { kind: "with_variables"; inner: FormulaError; bindings: [name: string, value: number][] }
  | {
      kind: "repeat_without_dice";
      body: string;
      multiplication: string | null;
      span: Span;
    };

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

export interface Reason {
  clause: string;
  from?: number;
  also?: string;
}

export interface Die {
  value: number;
  status: "kept" | "dropped" | "exploded" | "rerolled";
  parts?: number[];
  outcome?: "success" | "failure";
  natural?: "twenty" | "one";
  reason?: Reason;
}

export type Node =
  | { type: "number"; value: number }
  | {
      type: "dice";
      term: string;
      sides: number;
      modifiers?: string[];
      special?: "percentile";
      dice: Die[];
      subtotal: number;
      kind?: "count";
      successes?: number;
      failures?: number;
    }
  | { type: "neg"; operand: Node; total: number }
  | { type: "group"; inner: Node; total: number }
  | { type: "chain"; first: Node; rest: { op: BinOp; node: Node }[]; total: number };

export interface Roll {
  formula: string;
  kind?: "count";
  total: number;
  expr: Node;
  label?: string;
  iteration?: number;
  crit?: "hit" | "miss";
  doubled?: boolean;
}

export interface RollsReport {
  kind: "rolls";
  rolls: Roll[];
  hints: Hint[];
  lines: string[];
  preset: [name: string, formula: string] | null;
}

export type ErrorReport =
  | {
      kind: "formula";
      error: FormulaError;
      message: string;
      hints: Hint[];
      source: string;
    }
  | {
      kind: "undefined_variable";
      error: FormulaError;
      name: string;
      character: string;
      defined: string[];
      suggestion: string | null;
      explicit: boolean;
      message: string;
      hints: Hint[];
      source: string;
    }
  | { kind: "usage"; message: string; hints: Hint[]; usage: string }
  | {
      kind: "unknown_preset";
      word: string;
      suggestion: string | null;
      message: string;
      hints: Hint[];
    };

export type RollReport = { ok: RollsReport } | { error: ErrorReport };
