/** Dice on the keypad, smallest first. */
export const KEYPAD_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

/** What a keypad key does to the formula. */
export type Key =
  | { kind: "die"; sides: number }
  | { kind: "digit"; digit: string }
  | { kind: "op"; op: "+" | "-" }
  | { kind: "back" }
  | { kind: "clear" };

/**
 * The formula after a keypad key. A die after a number joins it (`2` then d6 is
 * `2d6`); a die after nothing, an operator or another die starts a new term
 * (`d6`, then d8, is `d6+d8`), so taps always make a formula the engine accepts.
 */
export function press(formula: string, key: Key): string {
  switch (key.kind) {
    case "digit":
      return formula + key.digit;
    case "op":
      return formula.trim() === "" || /[+-]$/.test(formula) ? formula : formula + key.op;
    case "back":
      return formula.slice(0, -1);
    case "clear":
      return "";
    case "die": {
      if (/\d$/.test(formula) && !/d\d+$/.test(formula)) return `${formula}d${key.sides}`;
      const term = `d${key.sides}`;
      if (formula === "" || /[+-]$/.test(formula)) return formula + term;
      return `${formula}+${term}`;
    }
  }
}
