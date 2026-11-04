import type { Die, Node } from "./types";

export type Natural = "twenty" | "one";

/** The dice node, if the whole roll is a lone d20 with only flat +/- numbers.
 * Same rule as `natural` in src/render.rs. */
function loneDice(expr: Node): Extract<Node, { type: "dice" }> | null {
  if (expr.type === "dice") return expr;
  if (expr.type !== "chain") return null;
  const operands = [expr.first, ...expr.rest.map((l) => l.node)].filter(
    (n) => n.type !== "number",
  );
  if (operands.length !== 1) return null;
  if (!expr.rest.every((l) => l.op === "+" || l.op === "-")) return null;
  return operands[0].type === "dice" ? operands[0] : null;
}

export function natural(expr: Node): Natural | null {
  const node = loneDice(expr);
  if (!node || node.sides !== 20) return null;
  // Dice a reroll replaced are history; only the one that stands counts.
  const standing: Die[] = node.dice.filter((d) => d.status !== "rerolled");
  if (standing.length !== 1 || (standing[0].parts?.length ?? 0) > 1) return null;
  if (standing[0].value === 20) return "twenty";
  if (standing[0].value === 1) return "one";
  return null;
}
