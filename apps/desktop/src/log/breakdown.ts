import { natural, type Natural } from "./natural";
import type { Die, Node, Roll } from "./types";

/** How a die is drawn. Each state has a glyph, so colour is never the only
 * signal. */
export type DieState =
  | "kept"
  | "dropped"
  | "exploded"
  | "rerolled"
  | "replacement"
  | "success"
  | "failure"
  | "nat20"
  | "nat1";

export interface DieCell {
  type: "die";
  state: DieState;
  /** What is drawn: `5`, `(1)`, `9✓`, `6!`, `↻4`. */
  text: string;
  /** Spoken form for screen readers and the tooltip. */
  spoken: string;
}

export type Cell = DieCell | { type: "text"; text: string };

function dieCell(die: Die, dice: Die[], nat: Natural | null): DieCell {
  const face = String(die.value);
  const bang = die.status === "exploded" || (die.parts?.length ?? 0) > 1 ? "!" : "";
  if (die.status === "rerolled") {
    return { type: "die", state: "rerolled", text: face, spoken: `${face} rerolled` };
  }
  if (die.status === "dropped") {
    return { type: "die", state: "dropped", text: `(${face}${bang})`, spoken: `${face} dropped` };
  }
  if (die.outcome === "success") {
    return { type: "die", state: "success", text: `${face}${bang}✓`, spoken: `${face} success` };
  }
  if (die.outcome === "failure") {
    return { type: "die", state: "failure", text: `${face}${bang}✗`, spoken: `${face} failure` };
  }
  const replaces = die.reason?.from !== undefined && dice[die.reason.from]?.status === "rerolled";
  if (nat === "twenty") {
    return { type: "die", state: "nat20", text: `${replaces ? "↻" : ""}${face}`, spoken: "natural 20" };
  }
  if (nat === "one") {
    return { type: "die", state: "nat1", text: `${replaces ? "↻" : ""}${face}`, spoken: "natural 1" };
  }
  if (replaces) {
    return {
      type: "die",
      state: "replacement",
      text: `↻${face}${bang}`,
      spoken: `rerolled to ${face}`,
    };
  }
  if (die.status === "exploded" || bang) {
    return { type: "die", state: "exploded", text: `${face}${bang}`, spoken: `${face} exploded` };
  }
  return { type: "die", state: "kept", text: face, spoken: `${face} kept` };
}

function walk(node: Node, nat: Natural | null, out: Cell[]): void {
  const text = (t: string) => out.push({ type: "text", text: t });
  switch (node.type) {
    case "number":
      text(String(node.value));
      break;
    case "dice": {
      text("[");
      node.dice.forEach((d, i) => {
        if (i > 0) text(", ");
        out.push(dieCell(d, node.dice, nat));
      });
      text("]");
      break;
    }
    case "neg":
      text("-");
      walk(node.operand, nat, out);
      break;
    case "group":
      text("(");
      walk(node.inner, nat, out);
      text(")");
      break;
    case "chain":
      walk(node.first, nat, out);
      for (const link of node.rest) {
        text(` ${link.op} `);
        walk(link.node, nat, out);
      }
      break;
  }
}

function hasDice(node: Node): boolean {
  switch (node.type) {
    case "number":
      return false;
    case "dice":
      return true;
    case "neg":
      return hasDice(node.operand);
    case "group":
      return hasDice(node.inner);
    case "chain":
      return hasDice(node.first) || node.rest.some((l) => hasDice(l.node));
  }
}

/** The breakdown cells of a roll; empty when the formula has no dice. */
export function breakdown(roll: Roll): Cell[] {
  if (!hasDice(roll.expr)) return [];
  const out: Cell[] = [];
  walk(roll.expr, natural(roll.expr), out);
  return out;
}

function tally(node: Node): { successes: number; failures: number } | null {
  if (node.type === "dice") {
    return node.kind === "count"
      ? { successes: node.successes ?? 0, failures: node.failures ?? 0 }
      : null;
  }
  return node.type === "group" ? tally(node.inner) : null;
}

/** `17` for a sum; `3 successes` for a success count. Short enough for the
 * 120px total column, which never truncates. */
export function totalText(roll: Roll): string {
  const t = tally(roll.expr);
  if (!t) return String(roll.total);
  const net = t.successes - t.failures;
  return `${net} ${Math.abs(net) === 1 ? "success" : "successes"}`;
}

/** The CLI's longer wording, `2 successes (3 - 1 failure)`, for a tooltip. */
export function totalDetail(roll: Roll): string {
  const t = tally(roll.expr);
  if (!t || t.failures === 0) return totalText(roll);
  const net = t.successes - t.failures;
  const noun = Math.abs(net) === 1 ? "success" : "successes";
  const failNoun = t.failures === 1 ? "failure" : "failures";
  return `${net} ${noun} (${t.successes} - ${t.failures} ${failNoun})`;
}
