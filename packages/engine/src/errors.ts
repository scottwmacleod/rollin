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

export const repeatWithoutDice = (
  body: string,
  multiplication: string | null,
  span: Span,
): FormulaFailure =>
  new FormulaFailure({ kind: "repeat_without_dice", body, multiplication, span });

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
    case "division_by_zero":
      return "division by zero";
    case "overflow":
      return "arithmetic overflow";
    case "repeat_without_dice":
      return `'x' means repeat, and '${error.body}' has no dice to repeat`;
  }
}

/** Suggestions for fixing the error, as data. */
export function hintsOf(error: FormulaError): Hint[] {
  if (error.kind === "repeat_without_dice") {
    return [{ kind: "use_multiplication", suggestion: error.multiplication }];
  }
  return [];
}
