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
  | { type: "chain"; first: Arith; rest: { op: BinOp; operand: Arith }[] };

export interface DiceTerm {
  text: string;
  count: number;
  sides: number;
  special?: "percentile";
  reroll?: Reroll;
  explode?: Explode;
  clauses: { reroll?: string; explode?: string; select?: string };
  success?: Success;
  select?: Select;
  modifiers: string[];
}

export type SelectKind = "drop_lowest" | "drop_highest" | "keep_lowest" | "keep_highest";

export interface Select {
  kind: SelectKind;
  n: number;
}

export type Cmp = "gt" | "ge" | "lt" | "le" | "eq";

export interface Reroll {
  mode: "once" | "repeat";
  cmp: Cmp;
  value: number;
}

export interface Explode {
  mode: "plain" | "compound" | "penetrate";
  cmp: Cmp;
  value: number;
}

export interface Success {
  cmp: Cmp;
  value: number;
  failure?: { cmp: Cmp; value: number };
}

export const test = (cmp: Cmp, face: number, value: number): boolean => {
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

export const succeeds = (s: Success, face: number): boolean => test(s.cmp, face, s.value);

export const fails = (s: Success, face: number): boolean =>
  !succeeds(s, face) && s.failure !== undefined && test(s.failure.cmp, face, s.failure.value);

export function isCount(expr: Arith): boolean {
  const kind = expr.kind;
  if (kind.type === "dice") return kind.dice.success !== undefined;
  return kind.type === "group" && isCount(kind.inner);
}

export interface RollAst {
  source: string;
  expr: Arith;
  label?: string;
  role?: Role;
  crit?: boolean;
}

export type Role = "attack" | "damage";

export function d20Terms(expr: Arith): number {
  const kind = expr.kind;
  switch (kind.type) {
    case "number":
      return 0;
    case "dice":
      return kind.dice.sides === 20 ? 1 : 0;
    case "neg":
      return d20Terms(kind.operand);
    case "group":
      return d20Terms(kind.inner);
    case "chain":
      return d20Terms(kind.first) + kind.rest.reduce((n, r) => n + d20Terms(r.operand), 0);
  }
}

export function isCheckDie(term: DiceTerm): boolean {
  const oneKept = term.select?.n === 1;
  return (
    term.sides === 20 &&
    term.success === undefined &&
    term.explode === undefined &&
    (term.count === 1 || (term.count === 2 && oneKept))
  );
}

function firstD20(expr: Arith): DiceTerm | undefined {
  const kind = expr.kind;
  switch (kind.type) {
    case "dice":
      return kind.dice.sides === 20 ? kind.dice : undefined;
    case "neg":
      return firstD20(kind.operand);
    case "group":
      return firstD20(kind.inner);
    case "chain":
      for (const part of [kind.first, ...kind.rest.map((r) => r.operand)]) {
        const found = firstD20(part);
        if (found) return found;
      }
      return undefined;
    default:
      return undefined;
  }
}

export function isD20Check(expr: Arith): boolean {
  if (d20Terms(expr) !== 1) return false;
  const term = firstD20(expr);
  return term !== undefined && isCheckDie(term);
}

export function roleOf(roll: RollAst): Role | undefined {
  if (roll.role) return roll.role;
  if (isD20Check(roll.expr)) return "attack";
  if (d20Terms(roll.expr) === 0 && hasDice(roll.expr)) return "damage";
  return undefined;
}

export interface FormulaAst {
  repeat?: number;
  rolls: RollAst[];
}

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
