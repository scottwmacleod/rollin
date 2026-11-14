/**
 * Parser: tokens to rolls. A roll is arithmetic over terms (dice groups and
 * numbers), parsed by precedence climbing. A port of the Rust parser for dice
 * terms and integer arithmetic; later loops of #216 add the rest of the syntax.
 */
import { type Arith, type Cmp, isCount, precedence, type RollAst, type Success } from "./ast";
import { countInArithmetic, invalidDice, limitExceeded, syntax } from "./errors";
import { type Spanned, type Token, tokenize } from "./lexer";
import { MAX_DEPTH, MAX_DICE_PER_ROLL, MAX_DICE_PER_TERM, MAX_SIDES } from "./limits";
import type { Source } from "./source";
import type { BinOp, Span } from "./types";

/** `d%` is a d100. */
const PERCENTILE_SIDES = 100;

export function parse(source: Source): RollAst[] {
  return new Parser(source, tokenize(source)).parseRolls();
}

function describe(token: Token): string {
  switch (token.kind) {
    case "number":
      return `number ${token.value}`;
    case "word":
      return `'${token.word}'`;
    case "plus":
      return "'+'";
    case "minus":
      return "'-'";
    case "star":
      return "'*'";
    case "slash":
      return "'/'";
    case "lparen":
      return "'('";
    case "rparen":
      return "')'";
    case "comma":
      return "','";
    case "bang":
      return "'!'";
    case "percent":
      return "'%'";
    case "gt":
      return "'>'";
    case "ge":
      return "'>='";
    case "lt":
      return "'<'";
    case "le":
      return "'<='";
    case "eq":
      return "'='";
    case "var":
      return `variable @${token.name}`;
    case "label":
      return "a label";
  }
}

const BINOPS: Partial<Record<Token["kind"], BinOp>> = {
  plus: "+",
  minus: "-",
  star: "*",
  slash: "/",
};

/** A success count is its own kind of result and cannot be an operand. */
function rejectCount(operand: Arith): void {
  if (isCount(operand)) throw countInArithmetic(operand.span);
}

const COMPARISONS: Partial<Record<Token["kind"], Cmp>> = {
  gt: "gt",
  ge: "ge",
  lt: "lt",
  le: "le",
  eq: "eq",
};

/** Joins `lhs op rhs`, extending a flat chain when the operator's level matches. */
function link(lhs: Arith, op: BinOp, rhs: Arith): Arith {
  const end = rhs.span.end;
  if (lhs.kind.type === "chain") {
    const firstOp = lhs.kind.rest[0]?.op;
    if (firstOp !== undefined && precedence(firstOp) === precedence(op)) {
      lhs.kind.rest.push({ op, operand: rhs });
      lhs.span = { start: lhs.span.start, end };
      return lhs;
    }
  }
  return {
    kind: { type: "chain", first: lhs, rest: [{ op, operand: rhs }] },
    span: { start: lhs.span.start, end },
  };
}

class Parser {
  private pos = 0;
  /** Parentheses and unary minus signs currently open. */
  private depth = 0;
  /** Dice rolled so far by the roll being parsed. */
  private itemDice = 0;

  constructor(
    private readonly src: Source,
    private readonly tokens: Spanned[],
  ) {}

  parseRolls(): RollAst[] {
    const rolls: RollAst[] = [];
    for (;;) {
      // Empty rolls are ignored, so `d20,,d6` and a trailing comma are fine.
      while (this.peek()?.kind === "comma") this.pos += 1;
      if (this.atEnd()) break;
      const start = this.here();
      this.itemDice = 0;
      const expr = this.parseExpr(1);
      const stop = this.prevEnd();
      rolls.push({ source: this.src.slice(start, stop).trim(), expr });
      if (!this.atEnd() && this.peek()?.kind !== "comma") {
        throw this.unexpected("',' or the end of the formula");
      }
    }
    if (rolls.length === 0) {
      throw syntax("no formulas provided", { start: 0, end: this.src.length });
    }
    return rolls;
  }

  private atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]?.token;
  }

  private here(): number {
    return this.tokens[this.pos]?.span.start ?? this.src.length;
  }

  private prevEnd(): number {
    return this.tokens[this.pos - 1]?.span.end ?? 0;
  }

  private unexpected(expected: string) {
    const t = this.tokens[this.pos];
    if (t === undefined) {
      const end = this.src.length;
      return syntax(`expected ${expected}, found end of input`, { start: end, end });
    }
    return syntax(`expected ${expected}, found ${describe(t.token)}`, t.span);
  }

  private number(what: string): number {
    const token = this.peek();
    if (token?.kind !== "number") throw this.unexpected(what);
    this.pos += 1;
    return token.value;
  }

  /** Precedence climbing: parses operators binding at least as tightly as `minPrec`. */
  private parseExpr(minPrec: number): Arith {
    let lhs = this.parseUnary();
    for (;;) {
      const kind = this.peek()?.kind;
      const op = kind === undefined ? undefined : BINOPS[kind];
      if (op === undefined || precedence(op) < minPrec) break;
      this.pos += 1;
      const rhs = this.parseExpr(precedence(op) + 1);
      rejectCount(lhs);
      rejectCount(rhs);
      lhs = link(lhs, op, rhs);
    }
    return lhs;
  }

  /** Unary `-` negates and unary `+` is a no-op. */
  private parseUnary(): Arith {
    const token = this.peek();
    if (token?.kind === "minus") {
      const start = this.tokens[this.pos]?.span.start ?? 0;
      this.enter(start);
      this.pos += 1;
      const operand = this.parseUnary();
      rejectCount(operand);
      this.depth -= 1;
      return { kind: { type: "neg", operand }, span: { start, end: operand.span.end } };
    }
    if (token?.kind === "plus") {
      this.pos += 1;
      return this.parseUnary();
    }
    return this.parseOperand();
  }

  /** Opens one more level of nesting at byte offset `at`. */
  private enter(at: number): void {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) {
      const rest = Array.from(this.src.slice(at));
      const shown = rest.slice(0, 16).join("");
      const more = rest.length > 16 ? "…" : "";
      const len = new TextEncoder().encode(rest[0] ?? " ").length;
      throw limitExceeded("nesting_depth", `${shown}${more}`, { start: at, end: at + len });
    }
  }

  private parseGroup(): Arith {
    const open = this.tokens[this.pos]?.span as Span;
    this.enter(open.start);
    this.pos += 1;
    const inner = this.parseExpr(1);
    this.depth -= 1;
    const token = this.peek();
    if (token?.kind === "rparen") {
      this.pos += 1;
      return { kind: { type: "group", inner }, span: { start: open.start, end: this.prevEnd() } };
    }
    if (token === undefined) throw syntax("unclosed '('", open);
    throw this.unexpected("')'");
  }

  private atComparison(): boolean {
    const kind = this.peek()?.kind;
    return kind !== undefined && kind in COMPARISONS;
  }

  /** A condition on a face: a comparison then a number, or a bare number meaning equals. */
  private parseCondition(what: string): { cmp: Cmp; value: number } {
    const kind = this.peek()?.kind;
    const cmp = (kind !== undefined && COMPARISONS[kind]) || "eq";
    if (this.atComparison()) this.pos += 1;
    return { cmp, value: this.number(what) };
  }

  /** Optional success clause such as `>=8`, with an optional failure clause `f1`. */
  private parseCount(): Success | undefined {
    const isF = (): boolean => {
      const token = this.peek();
      return token?.kind === "word" && token.word === "f";
    };
    if (!this.atComparison()) {
      if (isF()) {
        throw syntax(
          "a failure clause 'f' must follow a success clause, as in 6d10>=8f1",
          this.tokens[this.pos]?.span as Span,
        );
      }
      return undefined;
    }
    const { cmp, value } = this.parseCondition("a number after the success condition");
    if (!isF()) return { cmp, value };
    this.pos += 1;
    if (!this.atComparison() && this.peek()?.kind !== "number") {
      throw this.unexpected("a failure condition (a number, or a comparison such as <=2, >9, =1)");
    }
    const failure = this.parseCondition("a number after the failure condition");
    return { cmp, value, failure };
  }

  /** A parenthesised group, a number or a dice group. */
  private parseOperand(): Arith {
    const start = this.pos;
    if (this.peek()?.kind === "lparen") return this.parseGroup();
    let count = 1;
    const first = this.peek();
    if (first?.kind === "number") {
      this.pos += 1;
      const d = this.peek();
      if (!(d?.kind === "word" && d.word === "d")) {
        return {
          kind: { type: "number", value: first.value },
          span: this.tokens[start]?.span as Span,
        };
      }
      count = first.value;
    }
    const d = this.peek();
    if (!(d?.kind === "word" && d.word === "d")) {
      throw this.unexpected("a number, a dice group or '('");
    }
    this.pos += 1;
    const countSpan = this.tokens[start]?.span as Span;
    const sidesStart = this.pos;
    let sides: number;
    let special: "percentile" | undefined;
    if (this.peek()?.kind === "percent") {
      this.pos += 1;
      sides = PERCENTILE_SIDES;
      special = "percentile";
    } else {
      sides = this.number("the number of sides after 'd'");
    }
    const sidesSpan = this.tokens[sidesStart]?.span as Span;
    if (count > MAX_DICE_PER_TERM) {
      throw limitExceeded(
        "dice_per_term",
        this.src.slice(countSpan.start, sidesSpan.end),
        countSpan,
      );
    }
    if (count < 1) throw invalidDice("dice count must be at least 1", countSpan);
    if (sides < 2 || sides > MAX_SIDES) {
      throw invalidDice(`sides must be between 2 and ${MAX_SIDES}`, sidesSpan);
    }
    const successStart = this.here();
    const success = this.parseCount();
    const modifiers = success ? [this.src.slice(successStart, this.prevEnd())] : [];
    const span = { start: countSpan.start, end: this.prevEnd() };
    this.itemDice += count;
    if (this.itemDice > MAX_DICE_PER_ROLL) {
      throw limitExceeded("dice_per_roll", this.src.slice(span.start, span.end), span);
    }
    return {
      kind: {
        type: "dice",
        dice: {
          text: this.src.slice(span.start, span.end),
          count,
          sides,
          ...(special ? { special } : {}),
          ...(success ? { success } : {}),
          modifiers,
        },
      },
      span,
    };
  }
}
