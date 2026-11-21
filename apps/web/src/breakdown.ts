import type { Die, Node, Roll } from "@rollin/engine";

export type Mark = "dropped" | "rerolled" | "exploded";

export interface Shown {
  value: number;
  mark?: Mark;
  outcome?: "success" | "failure";
}

export type Cell = { type: "text"; text: string } | { type: "term"; term: string; dice: Shown[] };

function show(dice: Die[]): Shown[] {
  return dice.map((die, i) => {
    const exploded = dice[i + 1]?.status === "exploded" || (die.parts?.length ?? 0) > 1;
    const mark: Mark | undefined =
      die.status === "dropped" || die.status === "rerolled"
        ? die.status
        : exploded
          ? "exploded"
          : undefined;
    return {
      value: die.value,
      ...(mark ? { mark } : {}),
      ...(die.outcome ? { outcome: die.outcome } : {}),
    };
  });
}

function walk(node: Node, out: Cell[]): void {
  const text = (t: string) => out.push({ type: "text", text: t });
  switch (node.type) {
    case "number":
      text(String(node.value));
      break;
    case "dice":
      out.push({ type: "term", term: node.term, dice: show(node.dice) });
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
        text(link.op);
        walk(link.node, out);
      }
      break;
  }
}

export function breakdown(roll: Roll): Cell[] {
  const out: Cell[] = [];
  walk(roll.expr, out);
  return out.some((cell) => cell.type === "term") ? out : [];
}
