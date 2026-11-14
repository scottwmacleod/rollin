/** The syntax tree a formula parses into. Evaluation walks it. */
import type { BinOp, Span } from "./types";

export interface Arith {
  kind: ArithKind;
  span: Span;
}

export type ArithKind =
  | { type: "number"; value: number }
  | { type: "dice"; dice: DiceTerm }
  | { type: "neg"; operand: Arith }
  | { type: "group"; inner: Arith }
  /** Operands joined by operators of one precedence level, evaluated left to right. */
  | { type: "chain"; first: Arith; rest: { op: BinOp; operand: Arith }[] };

export interface DiceTerm {
  /** The term as written, such as `2d6`. */
  text: string;
  count: number;
  sides: number;
  special?: "percentile";
  /** The success clause, when the group counts successes instead of summing. */
  success?: Success;
  /** The modifier clauses as written, in order, such as `>=8f1`. */
  modifiers: string[];
}

export type Cmp = "gt" | "ge" | "lt" | "le" | "eq";

/** A success clause such as `>=8`, with the optional failure clause `f1`. */
export interface Success {
  cmp: Cmp;
  value: number;
  failure?: { cmp: Cmp; value: number };
}

const test = (cmp: Cmp, face: number, value: number): boolean => {
  switch (cmp) {
    case "gt":
      return face > value;
    case "ge":
      return face >= value;
    case "lt":
      return face < value;
    case "le":
      return face <= value;
    case "eq":
      return face === value;
  }
};

/** Whether a counting die showing `face` is a success. */
export const succeeds = (s: Success, face: number): boolean => test(s.cmp, face, s.value);

/** Whether a counting die is a failure. A success is never also a failure. */
export const fails = (s: Success, face: number): boolean =>
  !succeeds(s, face) && s.failure !== undefined && test(s.failure.cmp, face, s.failure.value);

/** Whether an expression is a success count, possibly in parentheses. */
export function isCount(expr: Arith): boolean {
  const kind = expr.kind;
  if (kind.type === "dice") return kind.dice.success !== undefined;
  return kind.type === "group" && isCount(kind.inner);
}

/** One comma-separated roll of a formula, before it is evaluated. */
export interface RollAst {
  /** The roll's source text, trimmed. */
  source: string;
  expr: Arith;
  /** The `# text` note after the roll. */
  label?: string;
}

/** A parsed formula: an optional repeat count and the rolls it applies to. */
export interface FormulaAst {
  /** The `N` of a leading `Nx`; undefined when the formula is not repeated. */
  repeat?: number;
  rolls: RollAst[];
}

/** Whether the expression rolls any dice (flat numbers do not). */
export function hasDice(expr: Arith): boolean {
  const kind = expr.kind;
  switch (kind.type) {
    case "number":
      return false;
    case "dice":
      return true;
    case "neg":
      return hasDice(kind.operand);
    case "group":
      return hasDice(kind.inner);
    case "chain":
      return hasDice(kind.first) || kind.rest.some((r) => hasDice(r.operand));
  }
}

export const precedence = (op: BinOp): number => (op === "+" || op === "-" ? 1 : 2);
