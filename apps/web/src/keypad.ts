export const KEYPAD_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

export type Key =
  | { kind: "die"; sides: number }
  | { kind: "digit"; digit: string }
  | { kind: "op"; op: "+" | "-" }
  | { kind: "back" }
  | { kind: "clear" };

export function press(formula: string, key: Key, fresh = false): string {
  if (fresh && (key.kind === "digit" || key.kind === "die")) return press("", key);
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
