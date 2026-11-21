import { FormulaFailure, messageOf } from "./errors";
import { parse } from "./parser";
import { Source } from "./source";
import type { FormulaError } from "./types";

export const COMMAND_WORDS: readonly string[] = [
  "save",
  "presets",
  "delete",
  "import",
  "roll",
  "set",
  "unset",
  "vars",
  "char",
  "characters",
  "help",
  "quit",
  "exit",
  "history",
];

const DICE_KEYWORDS = ["d", "dl", "dh", "kl", "kh", "r", "rr", "p", "f", "adv", "dis"];

export type NameRule =
  | "shape"
  | "command_word"
  | "dice_keyword"
  | "parses_as_formula"
  | "looks_like_dice";

export interface NameError {
  name: string;
  rule: NameRule;
  reason: string;
}

export function isNameShaped(name: string): boolean {
  return /^[a-z][a-z0-9_-]*$/.test(name);
}

export function editDistance(a: string, b: string): number {
  const bc = Array.from(b);
  let row = Array.from({ length: bc.length + 1 }, (_, i) => i);
  let i = 0;
  for (const ca of a) {
    let diag = row[0] as number;
    const next = [i + 1];
    for (let j = 0; j < bc.length; j += 1) {
      const up = row[j + 1] as number;
      next.push(Math.min(diag + (ca === bc[j] ? 0 : 1), up + 1, (next[j] as number) + 1));
      diag = up;
    }
    row = next;
    i += 1;
  }
  return row[bc.length] as number;
}

const REASONS: Record<Exclude<NameRule, "command_word" | "parses_as_formula">, string> = {
  shape: "names must start with a letter and use only letters, digits, '_' or '-'",
  dice_keyword: "it is a reserved dice keyword",
  looks_like_dice: "it looks like dice syntax",
};

function reasonFor(rule: NameRule, raw: string): string {
  switch (rule) {
    case "command_word":
      return `it is a command word (${COMMAND_WORDS.join(", ")})`;
    case "parses_as_formula":
      return `it would parse as the dice formula ${raw}`;
    default:
      return REASONS[rule];
  }
}

export function validatePresetName(raw: string): { name: string } | { error: NameError } {
  const name = raw.toLowerCase();
  const fail = (rule: NameRule) => ({ error: { name: raw, rule, reason: reasonFor(rule, raw) } });
  if (!isNameShaped(name)) return fail("shape");
  if (COMMAND_WORDS.includes(name)) return fail("command_word");
  if (DICE_KEYWORDS.includes(name)) return fail("dice_keyword");
  try {
    parse(new Source(name));
    return fail("parses_as_formula");
  } catch (failure) {
    if (!(failure instanceof FormulaFailure)) throw failure;
    return failure.error.kind === "syntax" ? { name } : fail("looks_like_dice");
  }
}

export function validateCharacterName(raw: string): { name: string } | { error: NameError } {
  const lower = raw.toLowerCase();
  if (lower === "new" || lower === "rename") {
    return { error: { name: raw, rule: "command_word", reason: reasonFor("command_word", raw) } };
  }
  return validatePresetName(raw);
}

export function validateVariableName(raw: string): string | null {
  const name = raw.toLowerCase();
  return /^[a-z][a-z0-9_]*$/.test(name) ? name : null;
}

export function checkFormula(
  text: string,
): { error: FormulaError; message: string; source: string } | null {
  try {
    parse(new Source(text), () => 2);
    return null;
  } catch (failure) {
    if (!(failure instanceof FormulaFailure)) throw failure;
    let { error } = failure;
    if (error.kind === "with_variables") {
      if (error.inner.kind !== "syntax") return null;
      error = error.inner;
    }
    return { error, message: messageOf(error), source: text };
  }
}
