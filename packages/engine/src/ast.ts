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
}

export const precedence = (op: BinOp): number => (op === "+" || op === "-" ? 1 : 2);
