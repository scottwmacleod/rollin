import { CAP_LIMITS } from "./limits";
import type { Cap, FormulaError, Hint, Span } from "./types";

/** Thrown inside the engine and caught by `roll`; it never leaves the package. */
export class FormulaFailure extends Error {
  readonly error: FormulaError;
  constructor(error: FormulaError) {
    super(messageOf(error));
    this.error = error;
  }
}

export const syntax = (message: string, span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "syntax", message, span });

export const invalidDice = (message: string, span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "invalid_dice", message, span });

export const limitExceeded = (cap: Cap, term: string, span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "limit_exceeded", cap, limit: CAP_LIMITS[cap], term, span });

export const divisionByZero = (span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "division_by_zero", span });

export const countInArithmetic = (span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "count_in_arithmetic", span });

export const overflow = (span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "overflow", span });

const CAP_NAMES: Record<Cap, string> = {
  dice_per_term: "dice per term",
  explosions_per_die: "explosions per die",
  rerolls_per_die: "rerolls per die",
  dice_per_roll: "dice per roll",
  nesting_depth: "nesting depth",
  repeat: "repeat",
};

/** A readable, neutral one-line description of what went wrong. */
export function messageOf(error: FormulaError): string {
  switch (error.kind) {
    case "syntax":
    case "invalid_dice":
      return error.message;
    case "limit_exceeded":
      return `${CAP_NAMES[error.cap]} cap (${error.limit}) exceeded by '${error.term}'`;
    case "count_in_arithmetic":
      return "a success count cannot be used in arithmetic; use it as a whole roll, or drop the success clause to sum the dice";
    case "division_by_zero":
      return "division by zero";
    case "overflow":
      return "arithmetic overflow";
  }
}

/** Suggestions for fixing the error. None of this subset's errors has one yet. */
export function hintsOf(_error: FormulaError): Hint[] {
  return [];
}
