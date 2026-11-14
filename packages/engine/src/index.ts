/**
 * The engine's one public entry point: `roll`. It knows nothing about React or
 * the browser; randomness comes in through a `DieSource` (ADR-0003).
 */

import type { DieSource } from "./dice";
import { FormulaFailure, hintsOf, messageOf } from "./errors";
import { evaluate } from "./eval";
import { parse } from "./parser";
import { Source } from "./source";
import type { Roll, RollReport } from "./types";

export const ENGINE_NAME = "rollin-engine";

export type { DieSource, Draw } from "./dice";
export { scriptedDice } from "./dice";
export { CAP_LIMITS, MAX_INT } from "./limits";
export type * from "./types";

/** Unicode White_Space, as Rust's `split_whitespace` sees it. */
const WHITESPACE = new RegExp(
  "[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+",
  "u",
);

const USAGE = "roll <formula or preset name>";

/**
 * Rolls what a player typed: a formula such as `2d6+3`, optionally after the
 * word `roll`. Never throws for a bad formula: that comes back as an error
 * report with its message, the byte span of the offending text and any hints.
 */
export function roll(line: string, dice: DieSource): RollReport {
  const words = line.split(WHITESPACE).filter((word) => word !== "");
  const rest = words[0]?.toLowerCase() === "roll" ? words.slice(1) : words;
  if (rest.length === 0) {
    return { error: { kind: "usage", message: `usage: ${USAGE}`, hints: [], usage: USAGE } };
  }
  const text = rest.join(" ");
  try {
    const formula = parse(new Source(text));
    const rolls: Roll[] = [];
    for (let iteration = 1; iteration <= (formula.repeat ?? 1); iteration += 1) {
      for (const ast of formula.rolls) {
        const rolled = evaluate(ast, dice);
        rolls.push(formula.repeat === undefined ? rolled : { ...rolled, iteration });
      }
    }
    return { ok: { kind: "rolls", rolls, hints: [], lines: [], preset: null } };
  } catch (failure) {
    if (!(failure instanceof FormulaFailure)) throw failure;
    const { error } = failure;
    return {
      error: {
        kind: "formula",
        error,
        message: messageOf(error),
        hints: hintsOf(error),
        source: text,
      },
    };
  }
}
