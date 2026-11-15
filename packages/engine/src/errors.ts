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

export const infiniteExplosion = (clause: string, sides: number, span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "infinite_explosion", clause, sides, span });

export const infiniteReroll = (clause: string, sides: number, span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "infinite_reroll", clause, sides, span });

export const divisionByZero = (span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "division_by_zero", span });

export const countInArithmetic = (span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "count_in_arithmetic", span });

export const repeatWithoutDice = (
  body: string,
  multiplication: string | null,
  span: Span,
): FormulaFailure =>
  new FormulaFailure({ kind: "repeat_without_dice", body, multiplication, span });

export const undefinedVariable = (name: string, span: Span): FormulaFailure =>
  new FormulaFailure({ kind: "undefined_variable", name, span });

/** The byte range of the text an error is about. */
export function spanOf(error: FormulaError): Span {
  return error.kind === "with_variables" ? spanOf(error.inner) : error.span;
}

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
    case "infinite_explosion":
      return `explosion condition '${error.clause}' is true for every face of a d${error.sides}, so it would never stop`;
    case "infinite_reroll":
      return `reroll condition '${error.clause}' is true for every face of a d${error.sides}, so it would never stop`;
    case "count_in_arithmetic":
      return "a success count cannot be used in arithmetic; use it as a whole roll, or drop the success clause to sum the dice";
    case "division_by_zero":
      return "division by zero";
    case "overflow":
      return "arithmetic overflow";
    case "repeat_without_dice":
      return `'x' means repeat, and '${error.body}' has no dice to repeat`;
    case "undefined_variable":
      return `undefined variable @${error.name}`;
    case "with_variables": {
      const values = error.bindings.map(([name, value]) => `@${name} is ${value}`).join(", ");
      const { inner } = error;
      // `@s is 1 but sides must be between 2 and 10000`
      if (inner.kind === "invalid_dice" && error.bindings.length === 1) {
        return `${values} but ${inner.message}`;
      }
      return `${messageOf(inner)} (${values})`;
    }
  }
}

/** Suggestions for fixing the error, as data. */
export function hintsOf(error: FormulaError): Hint[] {
  if (error.kind === "with_variables") return hintsOf(error.inner);
  if (error.kind === "repeat_without_dice") {
    return [{ kind: "use_multiplication", suggestion: error.multiplication }];
  }
  return [];
}
