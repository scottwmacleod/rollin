/** Evaluator: walks the syntax tree, drawing dice from the injected source. */
import type { Arith, RollAst, Select } from "./ast";
import type { DieSource } from "./dice";
import { divisionByZero, limitExceeded, overflow } from "./errors";
import { MAX_DICE_PER_ROLL, MAX_INT } from "./limits";
import type { BinOp, Die, Node, Roll, Span } from "./types";

const total = (node: Node): number => (node.type === "number" ? node.value : nodeTotal(node));

function nodeTotal(node: Exclude<Node, { type: "number" }>): number {
  return node.type === "dice" ? node.subtotal : node.total;
}

/** Evaluates one roll. */
export function evaluate(roll: RollAst, dice: DieSource): Roll {
  let rolled = 0;
  const walk = (expr: Arith): Node => {
    const kind = expr.kind;
    switch (kind.type) {
      case "number":
        return { type: "number", value: kind.value };
      case "dice": {
        const term = kind.dice;
        const faces: Die[] = [];
        for (let i = 0; i < term.count; i += 1) {
          rolled += 1;
          if (rolled > MAX_DICE_PER_ROLL)
            throw limitExceeded("dice_per_roll", term.text, expr.span);
          const value = dice(term.sides);
          if (!Number.isInteger(value) || value < 1 || value > term.sides) {
            throw new RangeError(`the die source returned ${value} for a d${term.sides}`);
          }
          faces.push({ value, status: "kept" });
        }
        if (term.select) applyDrops(faces, term.select, term.selectText ?? "");
        const subtotal = faces.reduce(
          (sum, die) => (die.status === "kept" ? sum + die.value : sum),
          0,
        );
        return {
          type: "dice",
          term: term.text,
          sides: term.sides,
          ...(term.selectText === undefined ? {} : { modifiers: [term.selectText] }),
          ...(term.special ? { special: term.special } : {}),
          dice: faces,
          subtotal,
        };
      }
      case "neg": {
        const operand = walk(kind.operand);
        // `0 - x`, so zero stays 0 and never becomes -0.
        return { type: "neg", operand, total: 0 - total(operand) };
      }
      case "group": {
        const inner = walk(kind.inner);
        return { type: "group", inner, total: total(inner) };
      }
      case "chain": {
        const first = walk(kind.first);
        let running = total(first);
        const rest: { op: BinOp; node: Node }[] = [];
        for (const { op, operand } of kind.rest) {
          const node = walk(operand);
          const span = { start: kind.first.span.start, end: operand.span.end };
          running = apply(op, running, total(node), span, operand.span);
          rest.push({ op, node });
        }
        return { type: "chain", first, rest, total: running };
      }
    }
  };
  const expr = walk(roll.expr);
  return {
    formula: roll.source,
    total: total(expr),
    expr,
    ...(roll.label !== undefined ? { label: roll.label } : {}),
  };
}

/**
 * Applies one operator with checked integer arithmetic. `span` covers the whole
 * operation (for overflow); `rhsSpan` is the right operand (for division by zero).
 * A result outside the safe integers is an overflow, so no total ever loses precision.
 */
function apply(op: BinOp, lhs: number, rhs: number, span: Span, rhsSpan: Span): number {
  if (op === "/" && rhs === 0) throw divisionByZero(rhsSpan);
  let result: number;
  switch (op) {
    case "+":
      result = lhs + rhs;
      break;
    case "-":
      result = lhs - rhs;
      break;
    case "*":
      result = lhs * rhs;
      break;
    case "/":
      // Integer division truncates toward zero. BigInt keeps it exact.
      result = Number(BigInt(lhs) / BigInt(rhs));
      break;
  }
  if (Math.abs(result) > MAX_INT) throw overflow(span);
  // Normalise -0 (`0 * -5`) to 0.
  return result === 0 ? 0 : result;
}

/**
 * Marks the dice a keep/drop clause removes. Keeping `n` of a pool drops the
 * rest from the other end; ties fall by roll order, as in the Rust engine.
 */
function applyDrops(dice: Die[], { kind, n }: Select, clause: string): void {
  const pool = dice.length;
  const [lowest, highest] =
    kind === "drop_lowest"
      ? [n, 0]
      : kind === "drop_highest"
        ? [0, n]
        : kind === "keep_highest"
          ? [pool - n, 0]
          : [0, pool - n];
  // Array.prototype.sort is stable, so equal faces keep their roll order.
  const order = dice.map((_, i) => i).sort((a, b) => (dice[a]?.value ?? 0) - (dice[b]?.value ?? 0));
  for (const i of [...order.slice(0, lowest), ...order.slice(pool - highest)]) {
    const die = dice[i];
    if (die) {
      die.status = "dropped";
      die.reason = { clause };
    }
  }
}
