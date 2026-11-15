/**
 * The engine's one public entry point: `roll`. It knows nothing about React or
 * the browser; randomness comes in through a `DieSource` (ADR-0003).
 */

import type { DieSource } from "./dice";
import { FormulaFailure, hintsOf, messageOf } from "./errors";
import { evaluate } from "./eval";
import { editDistance, isNameShaped } from "./names";
import { parse } from "./parser";
import { Source } from "./source";
import type { Roll, RollReport } from "./types";

export const ENGINE_NAME = "rollin-engine";

export type { DieSource, Draw } from "./dice";
export { scriptedDice } from "./dice";
export { CAP_LIMITS, MAX_INT } from "./limits";
export type { NameError, NameRule } from "./names";
export { COMMAND_WORDS, checkFormula, validatePresetName } from "./names";
export type * from "./types";

/** Unicode White_Space, as Rust's `split_whitespace` sees it. */
const WHITESPACE = new RegExp(
  "[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+",
  "u",
);

const USAGE = "roll <formula or preset name>";

/** The presets a line can name. A character's own shadow a global one of the same name. */
export interface RollContext {
  globalPresets?: Readonly<Record<string, string>>;
  characterPresets?: Readonly<Record<string, string>>;
}

/** The text of a roll as it goes to the parser; errors are reported against it. */
function rollText(text: string, dice: DieSource, preset: [string, string] | null): RollReport {
  try {
    const formula = parse(new Source(text));
    const rolls: Roll[] = [];
    for (let iteration = 1; iteration <= (formula.repeat ?? 1); iteration += 1) {
      for (const ast of formula.rolls) {
        const rolled = evaluate(ast, dice);
        rolls.push(formula.repeat === undefined ? rolled : { ...rolled, iteration });
      }
    }
    return { ok: { kind: "rolls", rolls, hints: [], lines: [], preset } };
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

/**
 * Rolls what a player typed: a formula such as `2d6+3`, or the name of a saved
 * preset, optionally after the word `roll`. Never throws for a bad formula:
 * that comes back as an error report with its message, the byte span of the
 * offending text and any hints.
 */
export function roll(line: string, dice: DieSource, context: RollContext = {}): RollReport {
  const words = line.split(WHITESPACE).filter((word) => word !== "");
  const rest = words[0]?.toLowerCase() === "roll" ? words.slice(1) : words;
  if (rest.length === 0) {
    return { error: { kind: "usage", message: `usage: ${USAGE}`, hints: [], usage: USAGE } };
  }
  const word = rest[0] as string;
  if (rest.length === 1 && isNameShaped(word.toLowerCase()) && isNotAFormula(word)) {
    // A lone word that is not a formula may name a saved preset.
    const name = word.toLowerCase();
    const own = context.characterPresets ?? {};
    const global = context.globalPresets ?? {};
    const formula = lookup(own, name) ?? lookup(global, name);
    if (formula !== undefined) return rollText(formula, dice, [name, formula]);
    const names = [...new Set([...Object.keys(own), ...Object.keys(global)])].sort();
    const suggestion = names.find((n) => editDistance(n, name) <= 2) ?? null;
    return {
      error: {
        kind: "unknown_preset",
        word,
        suggestion,
        message: `'${word}' is not a valid formula or a known preset`,
        hints: [
          ...(suggestion === null ? [] : [{ kind: "did_you_mean" as const, name: suggestion }]),
          { kind: "list_presets" },
        ],
      },
    };
  }
  return rollText(rest.join(" "), dice, null);
}

function lookup(presets: Readonly<Record<string, string>>, name: string): string | undefined {
  return Object.hasOwn(presets, name) ? presets[name] : undefined;
}

/** Whether `text` fails to parse as a formula with a syntax error (not a bad dice group like `d6dl9`). */
function isNotAFormula(text: string): boolean {
  try {
    parse(new Source(text));
    return false;
  } catch (failure) {
    if (!(failure instanceof FormulaFailure)) throw failure;
    return failure.error.kind === "syntax";
  }
}
