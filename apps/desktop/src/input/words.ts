// Pure helpers for the formula box. No library logic lives here: the library
// decides what parses and what completes; this only decides what to ask it.

import type { CommandInfo } from "../api/types";

/** Whether `line` is a formula (or preset name) worth sending to `check`.
 * A line starting with a command word is not: `check` would reject it. */
export function isFormulaLine(line: string, vocabulary: CommandInfo[]): boolean {
  const first = line.trim().split(/\s+/)[0] ?? "";
  if (first === "") return false;
  if (first.startsWith("-")) return false;
  return !findCommand(first, vocabulary);
}

/** The command `word` invokes. Command words match in any case, as they do
 * in the library's parser. */
function findCommand(word: string, vocabulary: CommandInfo[]): CommandInfo | undefined {
  const w = word.toLowerCase();
  return vocabulary.find((c) => c.words.includes(w));
}

/** The usage line for the command word at the start of `line`, once that word
 * is fully typed (a space after it, or the whole line is exactly the word).
 * The words and usage lines come from the library's table, so a new command
 * shows up here without a change. */
export function usageFor(line: string, vocabulary: CommandInfo[]): string | null {
  const m = /^\s*(\S+)(\s|$)/.exec(line);
  if (!m) return null;
  return findCommand(m[1], vocabulary)?.usage ?? null;
}

export type Piece = { text: string; kind: "plain" | "variable" | "label" };

/** Splits `line` for colouring: `@variables` and `# labels` (which run to the
 * next comma). Concatenating the pieces gives `line` back. */
export function pieces(line: string): Piece[] {
  const out: Piece[] = [];
  const re = /@[A-Za-z0-9_]*|#[^,]*/g;
  let at = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: line.slice(at, i), kind: "plain" });
    out.push({ text: m[0], kind: m[0].startsWith("@") ? "variable" : "label" });
    at = i + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at), kind: "plain" });
  return out;
}

/** Longest common prefix of `words`. */
export function commonPrefix(words: string[]): string {
  if (words.length === 0) return "";
  let p = words[0];
  for (const w of words.slice(1)) {
    let i = 0;
    while (i < p.length && i < w.length && p[i] === w[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}

/** Input history: ↑ goes back, ↓ forward, and ↓ past the newest restores the
 * line that was being typed. */
export class History {
  private items: string[];
  private cursor: number;
  private draft = "";

  constructor(initial: string[] = []) {
    this.items = [...initial];
    this.cursor = this.items.length;
  }

  push(line: string): void {
    if (line !== "" && this.items[this.items.length - 1] !== line) this.items.push(line);
    this.cursor = this.items.length;
    this.draft = "";
  }

  /** The earlier line, or null at the oldest. `current` is kept as the draft. */
  prev(current: string): string | null {
    if (this.items.length === 0 || this.cursor === 0) return null;
    if (this.cursor === this.items.length) this.draft = current;
    this.cursor -= 1;
    return this.items[this.cursor];
  }

  /** The later line (the draft past the newest), or null when not browsing. */
  next(): string | null {
    if (this.cursor >= this.items.length) return null;
    this.cursor += 1;
    return this.cursor === this.items.length ? this.draft : this.items[this.cursor];
  }

  /** Back to typing fresh; called when the text is edited. */
  reset(): void {
    this.cursor = this.items.length;
  }
}
