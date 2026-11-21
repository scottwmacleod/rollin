import { syntax } from "./errors";
import { MAX_INT } from "./limits";
import { type Source, utf8Length } from "./source";
import type { Span } from "./types";

export type Token =
  | { kind: "number"; value: number }
  | { kind: "word"; word: string }
  | { kind: "var"; name: string }
  | { kind: "label"; text: string }
  | {
      kind:
        | "plus"
        | "minus"
        | "star"
        | "slash"
        | "lparen"
        | "rparen"
        | "comma"
        | "bang"
        | "percent"
        | "gt"
        | "ge"
        | "lt"
        | "le"
        | "eq";
    };

export interface Spanned {
  token: Token;
  span: Span;
}

const SINGLE: Record<string, Token> = {
  ">": { kind: "gt" },
  "<": { kind: "lt" },
  "=": { kind: "eq" },
  "+": { kind: "plus" },
  "-": { kind: "minus" },
  "*": { kind: "star" },
  "/": { kind: "slash" },
  "(": { kind: "lparen" },
  ")": { kind: "rparen" },
  ",": { kind: "comma" },
  "!": { kind: "bang" },
  "%": { kind: "percent" },
};

const isDigit = (c: string) => c >= "0" && c <= "9";
const isAlpha = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
const isNameChar = (c: string) => isAlpha(c) || isDigit(c) || c === "_";

export function tokenize(source: Source): Spanned[] {
  const chars = Array.from(source.text);
  const at: number[] = [];
  let offset = 0;
  for (const c of chars) {
    at.push(offset);
    offset += utf8Length(c.codePointAt(0) ?? 0);
  }
  at.push(offset);

  const out: Spanned[] = [];
  const push = (token: Token, from: number, to: number) =>
    out.push({ token, span: { start: at[from] ?? 0, end: at[to] ?? offset } });
  let i = 0;
  while (i < chars.length) {
    const c = chars[i] as string;
    const next = chars[i + 1];
    if ((c === ">" || c === "<") && next === "=") {
      push({ kind: c === ">" ? "ge" : "le" }, i, i + 2);
      i += 2;
      continue;
    }
    if (c === "#") {
      let end = i;
      while (end < chars.length && chars[end] !== ",") end += 1;
      const text = source.slice(at[i + 1] ?? 0, at[end]).trim();
      if (text === "") {
        throw syntax("a label '#' needs text after it, as in '# attack'", {
          start: at[i] ?? 0,
          end: at[i + 1] ?? offset,
        });
      }
      push({ kind: "label", text }, i, end);
      i = end;
      continue;
    }
    const single = SINGLE[c];
    if (single) {
      push(single, i, i + 1);
      i += 1;
    } else if (isDigit(c)) {
      let end = i;
      while (end < chars.length && isDigit(chars[end] as string)) end += 1;
      const value = Number(chars.slice(i, end).join(""));
      if (!Number.isSafeInteger(value) || value > MAX_INT) {
        throw syntax("number is too large", { start: at[i] ?? 0, end: at[end] ?? offset });
      }
      push({ kind: "number", value }, i, end);
      i = end;
    } else if (c === "@") {
      let end = i + 1;
      while (end < chars.length && isNameChar(chars[end] as string)) end += 1;
      const name = chars
        .slice(i + 1, end)
        .join("")
        .toLowerCase();
      if (!/^[a-z]/.test(name)) {
        throw syntax(
          "'@' must be followed by a variable name that starts with a letter, as in '@str'",
          { start: at[i] ?? 0, end: at[end] ?? offset },
        );
      }
      push({ kind: "var", name }, i, end);
      i = end;
    } else if (isAlpha(c)) {
      const penetrating = (c === "p" || c === "P") && out.at(-1)?.token.kind === "bang";
      let end = i;
      while (end < chars.length && isAlpha(chars[end] as string) && !(penetrating && end > i)) {
        end += 1;
      }
      const word = chars.slice(i, end).join("").toLowerCase();
      const start = at[i] ?? 0;
      const last = out.at(-1);
      let split = word.length;
      if (word.startsWith("adv") || word.startsWith("dis")) {
        split = 3;
      } else if (
        word.startsWith("x") &&
        last !== undefined &&
        (last.token.kind === "number" || last.token.kind === "var") &&
        (last.span.end === start || word === "x")
      ) {
        split = 1;
      }
      for (const [from, to] of [
        [0, split],
        [split, word.length],
      ] as const) {
        if (from < to) {
          out.push({
            token: { kind: "word", word: word.slice(from, to) },
            span: { start: start + from, end: start + to },
          });
        }
      }
      i = end;
    } else if (/\s/u.test(c)) {
      i += 1;
    } else {
      throw syntax(`unexpected character '${c}'`, { start: at[i] ?? 0, end: at[i + 1] ?? offset });
    }
  }
  return out;
}
