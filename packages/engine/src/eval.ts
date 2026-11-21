import {
  type Arith,
  fails,
  isCount,
  isD20Check,
  type RollAst,
  type Select,
  succeeds,
  test,
} from "./ast";
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

export function evaluate(roll: RollAst, dice: DieSource, double = false): Roll {
  let rolled = 0;
  let doubled = 0;
  const walk = (expr: Arith): Node => {
    const kind = expr.kind;
    switch (kind.type) {
      case "number":
        return { type: "number", value: kind.value };
      case "dice": {
        const term = kind.dice;
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
        const count = double ? term.count * 2 : term.count;
        if (double) doubled += 1;
        for (let i = 0; i < count; i += 1) {
          let raw = draw();
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
            if (die.reason) {
              if (clauses.explode !== undefined) die.reason.also = clauses.explode;
            } else if (clauses.explode !== undefined) {
              die.reason = reason(clauses.explode, undefined);
            }
            faces.push(die);
          } else {
            faces.push(die);
            const shift = explode?.mode === "penetrate" ? 1 : 0;
            extras.forEach((face, n) => {
              faces.push({
                value: face - shift,
                status: "exploded",
                ...(clauses.explode === undefined
                  ? {}
                  : { reason: reason(clauses.explode, dieIndex + n) }),
              });
            });
          }
        }
        if (term.select) applyDrops(faces, term.select, term.clauses.select ?? "");
        const kept = faces.filter((die) => die.status === "kept" || die.status === "exploded");
        const modifiers = term.modifiers.length > 0 ? { modifiers: term.modifiers } : {};
        const success = term.success;
        if (success) {
          let successes = 0;
          let failures = 0;
          for (const die of kept) {
            if (succeeds(success, die.value)) {
              die.outcome = "success";
              successes += 1;
            } else if (fails(success, die.value)) {
              die.outcome = "failure";
              failures += 1;
            }
          }
          return {
            type: "dice",
            term: term.text,
            sides: term.sides,
            ...modifiers,
            ...(term.special ? { special: term.special } : {}),
            dice: faces,
            subtotal: successes - failures,
            kind: "count",
            successes,
            failures,
          };
        }
        return {
          type: "dice",
          term: term.text,
          sides: term.sides,
          ...modifiers,
          ...(term.special ? { special: term.special } : {}),
          dice: faces,
          subtotal: kept.reduce((sum, die) => sum + die.value, 0),
        };
      }
      case "neg": {
        const operand = walk(kind.operand);
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
  if (isD20Check(roll.expr)) {
    const die = checkDie(expr);
    if (die) {
      if (die.value === 20) die.natural = "twenty";
      else if (die.value === 1) die.natural = "one";
    }
  }
  return {
    ...(doubled > 0 ? { doubled: true } : {}),
    formula: roll.source,
    ...(isCount(roll.expr) ? { kind: "count" as const } : {}),
    total: total(expr),
    expr,
    ...(roll.label !== undefined ? { label: roll.label } : {}),
  };
}

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
      result = Number(BigInt(lhs) / BigInt(rhs));
      break;
  }
  if (Math.abs(result) > MAX_INT) throw overflow(span);
  return result === 0 ? 0 : result;
}

function applyDrops(dice: Die[], { kind, n }: Select, clause: string): void {
  const live = dice.flatMap((die, i) => (die.status === "rerolled" ? [] : [i]));
  const pool = live.length;
  const [lowest, highest] =
    kind === "drop_lowest"
      ? [n, 0]
      : kind === "drop_highest"
        ? [0, n]
        : kind === "keep_highest"
          ? [pool - n, 0]
          : [0, pool - n];
  const order = live.sort((a, b) => (dice[a]?.value ?? 0) - (dice[b]?.value ?? 0));
  for (const i of [...order.slice(0, lowest), ...order.slice(pool - highest)]) {
    const die = dice[i];
    if (die) {
      die.status = "dropped";
      die.reason = { clause };
    }
  }
}

export function checkDie(root: Node): Die | undefined {
  const groups: Extract<Node, { type: "dice" }>[] = [];
  const collect = (node: Node): void => {
    switch (node.type) {
      case "dice":
        if (node.sides === 20) groups.push(node);
        break;
      case "neg":
        collect(node.operand);
        break;
      case "group":
        collect(node.inner);
        break;
      case "chain":
        collect(node.first);
        for (const link of node.rest) collect(link.node);
        break;
      case "number":
        break;
    }
  };
  collect(root);
  const [group] = groups;
  if (groups.length !== 1 || !group || group.kind === "count") return undefined;
  const standing = group.dice.filter((d) => d.status === "kept" || d.status === "exploded");
  const [die] = standing;
  if (standing.length !== 1 || !die) return undefined;
  if (die.parts && die.parts.length > 1) return undefined;
  return die;
}
