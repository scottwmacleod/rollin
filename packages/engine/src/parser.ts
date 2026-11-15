/**
 * Parser: tokens to rolls. A roll is arithmetic over terms (dice groups and
 * numbers), parsed by precedence climbing. A port of the Rust parser for dice
 * terms and integer arithmetic; later loops of #216 add the rest of the syntax.
 */
import {
  type Arith,
  type Cmp,
  type Explode,
  type FormulaAst,
  hasDice,
  isCount,
  precedence,
  type Reroll,
  type RollAst,
  type Select,
  type SelectKind,
  type Success,
  test,
} from "./ast";
import {
  countInArithmetic,
  infiniteExplosion,
  infiniteReroll,
  invalidDice,
  limitExceeded,
  repeatWithoutDice,
  syntax,
} from "./errors";
import { type Spanned, type Token, tokenize } from "./lexer";
import { MAX_DEPTH, MAX_DICE_PER_ROLL, MAX_DICE_PER_TERM, MAX_REPEAT, MAX_SIDES } from "./limits";
import type { Source } from "./source";
import type { BinOp, Span } from "./types";

/** `d%` is a d100. */
const PERCENTILE_SIDES = 100;

const SELECT_WORDS = new Map<string, SelectKind>([
  ["dl", "drop_lowest"],
  ["dh", "drop_highest"],
  ["kl", "keep_lowest"],
  ["kh", "keep_highest"],
]);

export function parse(source: Source): FormulaAst {
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

  parseRolls(): FormulaAst {
    const repeat = this.parseRepeat();
    const rolls: RollAst[] = [];
    for (;;) {
      // Empty rolls are ignored, so `d20,,d6` and a trailing comma are fine.
      while (this.peek()?.kind === "comma") this.pos += 1;
      if (this.atEnd()) break;
      const lead = this.tokens[this.pos];
      if (lead?.token.kind === "label") {
        throw syntax("a label needs a roll before it, as in 'd20 # attack'", lead.span);
      }
      const start = this.here();
      this.itemDice = 0;
      const expr = this.parseExpr(1);
      const stop = this.prevEnd();
      const tail = this.peek();
      let label: string | undefined;
      if (tail?.kind === "label") {
        label = tail.text;
        this.pos += 1;
      }
      rolls.push({
        source: this.src.slice(start, stop).trim(),
        expr,
        ...(label !== undefined ? { label } : {}),
      });
      if (!this.atEnd() && this.peek()?.kind !== "comma") {
        throw this.unexpected("',' or the end of the formula");
      }
    }
    if (repeat !== undefined) {
      const span = this.repeatSpan();
      if (rolls.length === 0) {
        throw syntax(`'${this.src.slice(span.start, span.end)}' has nothing to repeat`, span);
      }
      if (!rolls.some((roll) => hasDice(roll.expr))) {
        const body = this.src.slice(span.end, this.src.length).trim();
        const only = rolls.length === 1 && rolls[0]?.label === undefined;
        const count = this.src.slice(span.start, this.tokens[0]?.span.end).trim();
        throw repeatWithoutDice(body, only ? `${count}*${body}` : null, span);
      }
    }
    if (rolls.length === 0) {
      throw syntax("no formulas provided", { start: 0, end: this.src.length });
    }
    return repeat === undefined ? { rolls } : { repeat, rolls };
  }

  /** The span of a leading `Nx`. */
  private repeatSpan(): Span {
    return {
      start: this.tokens[0]?.span.start ?? 0,
      end: this.tokens[1]?.span.end ?? 0,
    };
  }

  /** Reads a leading `Nx`, returning N. */
  private parseRepeat(): number | undefined {
    const [n, x] = this.tokens;
    if (n?.token.kind !== "number" || x?.token.kind !== "word" || x.token.word !== "x") {
      return undefined;
    }
    const span = this.repeatSpan();
    if (n.token.value < 1) throw syntax("repeat count must be at least 1", span);
    if (n.token.value > MAX_REPEAT) {
      throw limitExceeded("repeat", this.src.slice(span.start, span.end), span);
    }
    this.pos = 2;
    return n.token.value;
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
    if (token.kind === "label") {
      throw syntax(
        "unclosed '(': a label runs to the next comma, so it swallowed the ')'; put labels at the end of a roll",
        open,
      );
    }
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
      if (d?.kind === "word" && d.word === "x") {
        const span = {
          start: this.tokens[start]?.span.start ?? 0,
          end: this.tokens[this.pos]?.span.end ?? 0,
        };
        throw syntax(
          `a repeat ('${this.src.slice(span.start, span.end)}') is allowed only once, at the very start of the formula`,
          span,
        );
      }
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
    const rerollStart = this.nextStart();
    const reroll = this.parseReroll(sides);
    const rerollText = this.clauseText(rerollStart, reroll !== undefined);
    const explodeStart = this.nextStart();
    const explode = this.parseExplode(sides);
    const explodeText = this.clauseText(explodeStart, explode !== undefined);
    const selectStart = this.here();
    const advantage = this.parseAdvantage(count, sides, countSpan.start);
    const select: Select | undefined = advantage
      ? { kind: advantage, n: 1 }
      : this.parseSelect(count);
    const selectText = this.clauseText(selectStart, select !== undefined);
    this.rejectSelectWithAdvantage(advantage, select);
    const successStart = this.here();
    const success = this.parseCount();
    const successText = this.clauseText(successStart, success !== undefined);
    const modifiers = [rerollText, explodeText, selectText, successText].filter(
      (c) => c !== undefined,
    );
    const span = { start: countSpan.start, end: this.prevEnd() };
    // `adv` and `dis` roll two dice.
    if (advantage) count = 2;
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
          ...(reroll ? { reroll } : {}),
          ...(explode ? { explode } : {}),
          ...(select ? { select } : {}),
          clauses: {
            ...(rerollText === undefined ? {} : { reroll: rerollText }),
            ...(explodeText === undefined ? {} : { explode: explodeText }),
            ...(selectText === undefined ? {} : { select: selectText }),
          },
          ...(success ? { success } : {}),
          modifiers,
        },
      },
      span,
    };
  }
  /** Byte offset where the next token starts (the end of the source when there is none). */
  private nextStart(): number {
    return this.here();
  }

  /** The source of the clause parsed since `start`, if there was one. */
  private clauseText(start: number, present: boolean): string | undefined {
    return present ? this.src.slice(start, this.prevEnd()) : undefined;
  }

  /** Optional `r` or `rr` reroll clause with a condition. */
  private parseReroll(sides: number): Reroll | undefined {
    const token = this.peek();
    if (token?.kind !== "word" || (token.word !== "r" && token.word !== "rr")) return undefined;
    const mode = token.word === "r" ? "once" : "repeat";
    const start = this.here();
    this.pos += 1;
    if (!this.atComparison() && this.peek()?.kind !== "number") {
      throw this.unexpected(
        "a reroll condition (a number, or a comparison such as <2, <=2, >5, >=5, =3)",
      );
    }
    const reroll: Reroll = { mode, ...this.parseCondition("a number after the reroll condition") };
    if (mode === "repeat" && everyFace(sides, (face) => test(reroll.cmp, face, reroll.value))) {
      const span = { start, end: this.prevEnd() };
      throw infiniteReroll(this.src.slice(span.start, span.end), sides, span);
    }
    return reroll;
  }

  /**
   * Optional `!` explode clause: `!` alone explodes on the maximum face, otherwise
   * a comparison (`>`, `>=`, `<`, `<=`, `=`) and a number follow.
   */
  private parseExplode(sides: number): Explode | undefined {
    if (this.peek()?.kind !== "bang") return undefined;
    const start = this.here();
    this.pos += 1;
    const next = this.peek();
    let mode: Explode["mode"] = "plain";
    if (next?.kind === "bang") {
      this.pos += 1;
      mode = "compound";
    } else if (next?.kind === "word" && next.word === "p") {
      this.pos += 1;
      mode = "penetrate";
    }
    const condition = this.atComparison()
      ? this.parseCondition("a number after the explode condition")
      : { cmp: "eq" as const, value: sides };
    const explode: Explode = { mode, ...condition };
    if (everyFace(sides, (face) => test(explode.cmp, face, explode.value))) {
      const span = { start, end: this.prevEnd() };
      throw infiniteExplosion(this.src.slice(span.start, span.end), sides, span);
    }
    return explode;
  }

  /** Optional `adv`/`dis` suffix: sugar for rolling two dice and keeping the highest or lowest. */
  private parseAdvantage(count: number, sides: number, termStart: number): SelectKind | undefined {
    const token = this.peek();
    if (token?.kind !== "word" || (token.word !== "adv" && token.word !== "dis")) return undefined;
    const adv = token.word === "adv";
    this.pos += 1;
    if (count !== 1) {
      throw invalidDice(
        `'${token.word}' applies to exactly one die; write d${sides}${token.word}, or 2d${sides}${adv ? "kh" : "kl"}1 to keep the ${adv ? "highest" : "lowest"} of two`,
        { start: termStart, end: this.prevEnd() },
      );
    }
    return adv ? "keep_highest" : "keep_lowest";
  }

  /** `adv`/`dis` already keep one die, so a keep/drop clause on either side of it is an error. */
  private rejectSelectWithAdvantage(
    advantage: SelectKind | undefined,
    select: Select | undefined,
  ): void {
    const token = this.peek();
    if (token?.kind !== "word") return;
    let word: string;
    if (advantage && SELECT_WORDS.has(token.word)) {
      word = advantage === "keep_highest" ? "adv" : "dis";
    } else if (!advantage && select && (token.word === "adv" || token.word === "dis")) {
      word = token.word;
    } else {
      return;
    }
    throw invalidDice(
      `'${word}' already keeps one die, so it cannot be combined with dl, dh, kl or kh`,
      this.tokens[this.pos]?.span as Span,
    );
  }

  /** Optional `dl`/`dh`/`kl`/`kh` clause with an optional count (default 1). */
  private parseSelect(count: number): Select | undefined {
    const token = this.peek();
    const kind = token?.kind === "word" ? SELECT_WORDS.get(token.word) : undefined;
    if (kind === undefined) return undefined;
    const wordSpan = this.tokens[this.pos]?.span as Span;
    this.pos += 1;
    const next = this.peek();
    let n = 1;
    if (next?.kind === "number") {
      n = next.value;
      this.pos += 1;
    }
    const span = { start: wordSpan.start, end: this.prevEnd() };
    const keeps = kind === "keep_lowest" || kind === "keep_highest";
    if (keeps && !(n >= 1 && n < count)) {
      throw invalidDice(`must keep between 1 and ${count - 1} dice from a pool of ${count}`, span);
    }
    if (!keeps && n >= count) {
      throw invalidDice(`cannot drop ${n} dice from a pool of ${count}`, span);
    }
    return { kind, n };
  }
}

/** Whether `holds` is true for every face from 1 to `sides`. */
function everyFace(sides: number, holds: (face: number) => boolean): boolean {
  for (let face = 1; face <= sides; face += 1) if (!holds(face)) return false;
  return true;
}
