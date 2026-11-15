/**
 * Completion for the formula box: preset names for the first word of a line and
 * `@variable` names anywhere, as the CLI's Tab completion offers them
 * (`src/completion.rs`). Pure, so it is tested without a browser.
 */

/** The names completion can offer. */
export interface CompletionData {
  /** Preset names the active character can roll. */
  presets: readonly string[];
  /** The active character's variable names, without the `@`. */
  variables: readonly string[];
}

/** Where the word being completed starts, and what it could become. */
export interface Completion {
  /** Index in the line where the replacement starts (at most the caret). */
  start: number;
  /** Sorted replacements for `line.slice(start, caret)`, never the word as typed. */
  candidates: string[];
}

const NONE = (start: number): Completion => ({ start, candidates: [] });

/** Sorted names that begin with `typed` (ignoring case) and are not just `typed` itself. */
function matching(names: readonly string[], typed: string): string[] {
  const lower = typed.toLowerCase();
  return [...new Set(names)]
    .filter((name) => name.toLowerCase().startsWith(lower) && name.toLowerCase() !== lower)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Completes the word ending at `caret`. A caret past either end is moved back inside. */
export function complete(line: string, caret: number, data: CompletionData): Completion {
  const end = Math.min(Math.max(caret, 0), line.length);
  const before = line.slice(0, end);
  const start = Math.max(before.search(/\S*$/u), 0);
  const typed = before.slice(start);
  const at = typed.lastIndexOf("@");
  if (at >= 0) {
    const run = typed.slice(at + 1);
    if (!/^[A-Za-z0-9_]*$/u.test(run)) return NONE(start);
    const names = data.variables.map((name) => `@${name}`);
    return { start: start + at, candidates: matching(names, typed.slice(at)) };
  }
  // Only the first word names a preset (an optional `roll` before it is skipped).
  const earlier = before.slice(0, start).trim().toLowerCase();
  const first = earlier === "" || earlier === "roll";
  if (!first || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(typed)) return NONE(start);
  return { start, candidates: matching(data.presets, typed) };
}

/** The line with `candidate` in place of the word being completed, and where the caret goes. */
export function accept(
  line: string,
  caret: number,
  completion: Completion,
  candidate: string,
): { line: string; caret: number } {
  const end = Math.min(Math.max(caret, 0), line.length);
  return {
    line: line.slice(0, completion.start) + candidate + line.slice(end),
    caret: completion.start + candidate.length,
  };
}
