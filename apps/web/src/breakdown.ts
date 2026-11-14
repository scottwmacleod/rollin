import type { Node, Roll } from "@rollin/engine";

/** One piece of a roll's breakdown: plain text, or a die with its face. */
export type Cell = { type: "text"; text: string } | { type: "die"; face: number; dropped: boolean };

function walk(node: Node, out: Cell[]): void {
  const text = (t: string) => out.push({ type: "text", text: t });
  switch (node.type) {
    case "number":
      text(String(node.value));
      break;
    case "dice":
      text("[");
      node.dice.forEach((die, i) => {
        if (i > 0) text(", ");
        out.push({ type: "die", face: die.value, dropped: die.status === "dropped" });
      });
      text("]");
      break;
    case "neg":
      text("-");
      walk(node.operand, out);
      break;
    case "group":
      text("(");
      walk(node.inner, out);
      text(")");
      break;
    case "chain":
      walk(node.first, out);
      for (const link of node.rest) {
        text(` ${link.op} `);
        walk(link.node, out);
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
      return hasDice(node.first) || node.rest.some((link) => hasDice(link.node));
  }
}

/** The breakdown of a roll, such as `[4, 5] + 3`; empty when the formula has no dice. */
export function breakdown(roll: Roll): Cell[] {
  if (!hasDice(roll.expr)) return [];
  const out: Cell[] = [];
  walk(roll.expr, out);
  return out;
}
