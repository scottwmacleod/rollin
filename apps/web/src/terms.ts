import type { Die, Node, Roll } from "@rollin/engine";

/** One dice term of a roll, such as `2d6`, with the faces it landed on. */
export interface Term {
  /** The term as written. */
  label: string;
  dice: Die[];
  subtotal: number;
}

function collect(node: Node, out: Term[]): void {
  switch (node.type) {
    case "number":
      break;
    case "dice":
      out.push({ label: node.term, dice: node.dice, subtotal: node.subtotal });
      break;
    case "neg":
      collect(node.operand, out);
      break;
    case "group":
      collect(node.inner, out);
      break;
    case "chain":
      collect(node.first, out);
      for (const link of node.rest) collect(link.node, out);
      break;
  }
}

/** The dice terms of a roll in the order written; empty when the formula has no dice. */
export function terms(roll: Roll): Term[] {
  const out: Term[] = [];
  collect(roll.expr, out);
  return out;
}
