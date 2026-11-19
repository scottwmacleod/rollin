import type { Die, Node, Roll } from "@rollin/engine";

/** How a die on the line is marked: struck (dropped, rerolled) or edged (exploded). */
export type Mark = "dropped" | "rerolled" | "exploded";

/** One die as the line shows it. */
export interface Shown {
  value: number;
  mark?: Mark;
  outcome?: "success" | "failure";
}

/** One piece of a roll's line: plain text, or a dice group's term with its dice. */
export type Cell = { type: "text"; text: string } | { type: "term"; term: string; dice: Shown[] };

/**
 * The engine marks the extra die an explosion added as `exploded`; the line marks
 * the die that exploded instead (the 6 of `2d6!`), as players say it. The extra die
 * follows it and counts like any other. A compounded die (`!!`) exploded when it
 * holds more than one roll.
 */
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

/**
 * A roll as one line, such as `2d6 4 5 + 3`: each dice group is its term followed by
 * its dice, every die included (dropped and rerolled ones too). Empty when
 * the formula has no dice.
 */
export function breakdown(roll: Roll): Cell[] {
  const out: Cell[] = [];
  walk(roll.expr, out);
  return out.some((cell) => cell.type === "term") ? out : [];
}
