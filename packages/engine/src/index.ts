/**
 * The engine's one public entry point: `roll`. It knows nothing about React or
 * the browser; randomness comes in through a `DieSource` (ADR-0003).
 */

import { type Role, type RollAst, roleOf } from "./ast";
import type { DieSource } from "./dice";
import { FormulaFailure, hintsOf, messageOf, spanOf } from "./errors";
import { checkDie, evaluate } from "./eval";
import { editDistance, isNameShaped } from "./names";
import { parse } from "./parser";
import { Source } from "./source";
import type { Node, Roll, RollReport } from "./types";

export const ENGINE_NAME = "rollin-engine";

export type { DieSource, Draw } from "./dice";
export { scriptedDice } from "./dice";
export { spanOf } from "./errors";
export { CAP_LIMITS, MAX_INT } from "./limits";
export type { NameError, NameRule } from "./names";
export {
  COMMAND_WORDS,
  checkFormula,
  validateCharacterName,
  validatePresetName,
  validateVariableName,
} from "./names";
export type * from "./types";

/** Unicode White_Space, as Rust's `split_whitespace` sees it. */
const WHITESPACE = new RegExp(
  "[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+",
  "u",
);

const USAGE = "roll <formula or preset name>";

/** The name a roll runs under when no character is given. */
export const DEFAULT_CHARACTER = "default";

/** A game system a character (or the global default) can play under. */
export type GameSystem = "dnd5e";

/** The lowest crit range a character can have: a natural 1 is always the critical miss. */
export const MIN_CRIT_RANGE = 2;
/** The default crit range, and the highest: a natural 20 always crits. */
export const MAX_CRIT_RANGE = 20;

/** The character a line rolls for: its name, its variables and its own presets. */
export interface CharacterContext {
  name: string;
  /** Lowercase name to integer value. */
  vars?: Readonly<Record<string, number>>;
  presets?: Readonly<Record<string, string>>;
  /** The game system this character plays under; without one the global default applies. */
  system?: GameSystem;
  /** The lowest kept d20 that is a critical hit (2 to 20, default 20). */
  critRange?: number;
}

/**
 * What a line runs against. A character's own presets shadow a global preset
 * of the same name, and `@name` in a formula resolves from its variables.
 */
export interface RollContext {
  globalPresets?: Readonly<Record<string, string>>;
  character?: CharacterContext;
  /** The game system for a character that names none. */
  defaultSystem?: GameSystem;
}

/**
 * Pairs attacks with the damage that follows them. Start a new one for each
 * `Nx` repeat. With no game system every roll stands alone.
 */
function pairing(system: GameSystem | undefined, critRange: number) {
  let attack: "hit" | "miss" | undefined;
  const role = (spec: RollAst): Role | undefined => (system ? roleOf(spec) : undefined);
  return {
    /** Whether `spec`'s dice double: by its `crit` suffix, or as damage after a critical hit. */
    doubles: (spec: RollAst): boolean =>
      spec.crit === true || (role(spec) === "damage" && attack === "hit"),
    /** Records the verdict on an evaluated attack. */
    judge(spec: RollAst, rolled: Roll): void {
      if (role(spec) !== "attack") return;
      const die = checkDie(rolled.expr);
      let verdict: "hit" | "miss" | undefined;
      if (findNatural(rolled.expr) === "one") verdict = "miss";
      else if (die && die.value >= critRange) verdict = "hit";
      if (verdict) rolled.crit = verdict;
      attack = verdict;
    },
  };
}

/** The first natural 20 or 1 marked on any die of the tree. */
function findNatural(node: Node): "twenty" | "one" | undefined {
  switch (node.type) {
    case "dice":
      return node.dice.find((d) => d.natural)?.natural;
    case "neg":
      return findNatural(node.operand);
    case "group":
      return findNatural(node.inner);
    case "chain":
      return findNatural(node.first) ?? node.rest.map((l) => findNatural(l.node)).find(Boolean);
    case "number":
      return undefined;
  }
}

/** The text of a roll as it goes to the parser; errors are reported against it. */
function rollText(
  text: string,
  dice: DieSource,
  preset: [string, string] | null,
  character: CharacterContext,
  defaultSystem?: GameSystem,
): RollReport {
  const vars = character.vars ?? {};
  try {
    const formula = parse(new Source(text), (name) =>
      Object.hasOwn(vars, name) ? vars[name] : undefined,
    );
    const rolls: Roll[] = [];
    for (let iteration = 1; iteration <= (formula.repeat ?? 1); iteration += 1) {
      const rules = pairing(
        character.system ?? defaultSystem,
        character.critRange ?? MAX_CRIT_RANGE,
      );
      for (const ast of formula.rolls) {
        const rolled = evaluate(ast, dice, rules.doubles(ast));
        rules.judge(ast, rolled);
        rolls.push(formula.repeat === undefined ? rolled : { ...rolled, iteration });
      }
    }
    return { ok: { kind: "rolls", rolls, hints: [], lines: [], preset } };
  } catch (failure) {
    if (!(failure instanceof FormulaFailure)) throw failure;
    const { error } = failure;
    if (error.kind === "undefined_variable") {
      const defined = Object.keys(vars).sort();
      const suggestion =
        defined
          .map((v) => [v, editDistance(v, error.name)] as const)
          .filter(([, distance]) => distance <= 2)
          .sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
      return {
        error: {
          kind: "undefined_variable",
          error,
          name: error.name,
          character: character.name,
          defined,
          suggestion,
          explicit: false,
          message: `${messageOf(error)} on character '${character.name}'`,
          hints: [
            { kind: "defined_variables", names: defined },
            ...(suggestion === null
              ? []
              : [{ kind: "did_you_mean_variable" as const, name: suggestion }]),
            { kind: "set_variable", character: character.name, name: error.name, explicit: false },
          ],
          source: text,
        },
      };
    }
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
  const character = context.character ?? { name: DEFAULT_CHARACTER };
  const word = rest[0] as string;
  if (rest.length === 1 && isNameShaped(word.toLowerCase()) && isNotAFormula(word)) {
    // A lone word that is not a formula may name a saved preset.
    const name = word.toLowerCase();
    const own = character.presets ?? {};
    const global = context.globalPresets ?? {};
    const formula = lookup(own, name) ?? lookup(global, name);
    if (formula !== undefined)
      return rollText(formula, dice, [name, formula], character, context.defaultSystem);
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
  return rollText(rest.join(" "), dice, null, character, context.defaultSystem);
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
