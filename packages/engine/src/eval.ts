/** Evaluator: walks the syntax tree, drawing dice from the injected source. */
import { type Arith, type RollAst, test } from "./ast";
import type { DieSource } from "./dice";
import { divisionByZero, limitExceeded, overflow } from "./errors";
import { MAX_DICE_PER_ROLL, MAX_EXPLOSIONS_PER_DIE, MAX_INT, MAX_REROLLS_PER_DIE } from "./limits";
import type { BinOp, Die, Node, Reason, Roll, Span } from "./types";

const reason = (clause: string, from: number | undefined): Reason => ({
  clause,
  ...(from === undefined ? {} : { from }),
});

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
        // Rolls one die, counting it toward the per-roll cap.
        const draw = (): number => {
          rolled += 1;
          if (rolled > MAX_DICE_PER_ROLL)
            throw limitExceeded("dice_per_roll", term.text, expr.span);
          const value = dice(term.sides);
          if (!Number.isInteger(value) || value < 1 || value > term.sides) {
            throw new RangeError(`the die source returned ${value} for a d${term.sides}`);
          }
          return value;
        };
        const { reroll, explode, clauses } = term;
        const faces: Die[] = [];
        for (let i = 0; i < term.count; i += 1) {
          let raw = draw();
          // The index of the last die this one's reroll replaced.
          let replaced: number | undefined;
          if (reroll) {
            let rerolls = 0;
            while (test(reroll.cmp, raw, reroll.value)) {
              if (rerolls === MAX_REROLLS_PER_DIE)
                throw limitExceeded("rerolls_per_die", term.text, expr.span);
              rerolls += 1;
              faces.push({
                value: raw,
                status: "rerolled",
                ...(clauses.reroll === undefined
                  ? {}
                  : { reason: reason(clauses.reroll, replaced) }),
              });
              replaced = faces.length - 1;
              raw = draw();
              if (reroll.mode === "once") break;
            }
          }
          const die: Die = {
            value: raw,
            status: "kept",
            ...(replaced !== undefined && clauses.reroll !== undefined
              ? { reason: reason(clauses.reroll, replaced) }
              : {}),
          };
          const dieIndex = faces.length;
          const extras: number[] = [];
          let explosions = 0;
          while (explode && test(explode.cmp, raw, explode.value)) {
            if (explosions === MAX_EXPLOSIONS_PER_DIE)
              throw limitExceeded("explosions_per_die", term.text, expr.span);
            explosions += 1;
            raw = draw();
            extras.push(raw);
          }
          if (explode?.mode === "compound" && extras.length > 0) {
            die.parts = [die.value, ...extras];
            die.value = die.parts.reduce((a, b) => a + b, 0);
            // A reroll replacement keeps its reroll reason (so the link back
            // survives) and records the compound clause as `also`.
            if (die.reason) {
              if (clauses.explode !== undefined) die.reason.also = clauses.explode;
            } else if (clauses.explode !== undefined) {
              die.reason = reason(clauses.explode, undefined);
            }
            faces.push(die);
          } else {
            faces.push(die);
            // A penetrating extra die counts one less, with no floor.
            const shift = explode?.mode === "penetrate" ? 1 : 0;
            extras.forEach((face, n) => {
              faces.push({
                value: face - shift,
                status: "exploded",
                // Each extra die exploded from the die just before it.
                ...(clauses.explode === undefined
                  ? {}
                  : { reason: reason(clauses.explode, dieIndex + n) }),
              });
            });
          }
        }
        const subtotal = faces
          .filter((d) => d.status !== "rerolled")
          .reduce((sum, d) => sum + d.value, 0);
        const modifiers = [clauses.reroll, clauses.explode].filter((c) => c !== undefined);
        return {
          type: "dice",
          term: term.text,
          sides: term.sides,
          ...(term.special ? { special: term.special } : {}),
          ...(modifiers.length > 0 ? { modifiers } : {}),
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
