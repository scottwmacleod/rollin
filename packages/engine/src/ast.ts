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
  reroll?: Reroll;
  explode?: Explode;
  /** The source text of each clause, for reporting why a die is what it is. */
  clauses: { reroll?: string; explode?: string };
}

export type Cmp = "gt" | "ge" | "lt" | "le" | "eq";

/** `r` rerolls a matching die once (the second result stands); `rr` until it no longer matches. */
export interface Reroll {
  mode: "once" | "repeat";
  cmp: Cmp;
  value: number;
}

/** `!` adds a separate die, `!!` adds into the exploding die, `!p` adds a die that counts one less. */
export interface Explode {
  mode: "plain" | "compound" | "penetrate";
  cmp: Cmp;
  value: number;
}

/** Whether `face <cmp> value` holds. */
export function test(cmp: Cmp, face: number, value: number): boolean {
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
