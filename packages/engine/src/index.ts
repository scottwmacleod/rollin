import { type Role, type RollAst, roleOf } from "./ast";
import type { DieSource } from "./dice";
import { FormulaFailure, hintsOf, messageOf } from "./errors";
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

const WHITESPACE = /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/u;

const USAGE = "roll <formula or preset name>";

export const DEFAULT_CHARACTER = "default";

export type GameSystem = "dnd5e";

export const MIN_CRIT_RANGE = 2;
export const MAX_CRIT_RANGE = 20;

export interface CharacterContext {
  name: string;
  vars?: Readonly<Record<string, number>>;
  presets?: Readonly<Record<string, string>>;
  system?: GameSystem;
  critRange?: number;
}

export interface RollContext {
  globalPresets?: Readonly<Record<string, string>>;
  character?: CharacterContext;
  defaultSystem?: GameSystem;
}

function pairing(system: GameSystem | undefined, critRange: number, rolls: Roll[]) {
  let pending: { at: number; verdict: "hit" | "miss" } | undefined;
  let attack: "hit" | "miss" | undefined;
  const role = (spec: RollAst): Role | undefined => (system ? roleOf(spec) : undefined);
  const mark = (at: number, verdict: "hit" | "miss"): void => {
    const rolled = rolls[at];
    if (rolled) rolls[at] = { ...rolled, crit: verdict };
  };
  return {
    doubles(spec: RollAst): boolean {
      if (role(spec) === "damage" && pending) {
        mark(pending.at, pending.verdict);
        pending = undefined;
      }
      return spec.crit === true || (role(spec) === "damage" && attack === "hit");
    },
    judge(spec: RollAst, rolled: Roll, at: number): void {
      if (role(spec) !== "attack") return;
      const die = checkDie(rolled.expr);
      let verdict: "hit" | "miss" | undefined;
      if (findNatural(rolled.expr) === "one") verdict = "miss";
      else if (die && die.value >= critRange) verdict = "hit";
      attack = verdict;
      pending = undefined;
      if (!verdict) return;
      if (spec.role === "attack") mark(at, verdict);
      else pending = { at, verdict };
    },
  };
}

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
        rolls,
      );
      for (const ast of formula.rolls) {
        const rolled = evaluate(ast, dice, rules.doubles(ast));
        rolls.push(formula.repeat === undefined ? rolled : { ...rolled, iteration });
        rules.judge(ast, rolled, rolls.length - 1);
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

export function roll(line: string, dice: DieSource, context: RollContext = {}): RollReport {
  const words = line.split(WHITESPACE).filter((word) => word !== "");
  const rest = words[0]?.toLowerCase() === "roll" ? words.slice(1) : words;
  if (rest.length === 0) {
    return { error: { kind: "usage", message: `usage: ${USAGE}`, hints: [], usage: USAGE } };
  }
  const character = context.character ?? { name: DEFAULT_CHARACTER };
  const word = rest[0] as string;
  if (rest.length === 1 && isNameShaped(word.toLowerCase()) && isNotAFormula(word)) {
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

function isNotAFormula(text: string): boolean {
  try {
    parse(new Source(text));
    return false;
  } catch (failure) {
    if (!(failure instanceof FormulaFailure)) throw failure;
    return failure.error.kind === "syntax";
  }
}
