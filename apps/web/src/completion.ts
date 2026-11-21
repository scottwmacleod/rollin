export interface CompletionData {
  presets: readonly string[];
  variables: readonly string[];
}

export interface Completion {
  start: number;
  candidates: string[];
}

const NONE = (start: number): Completion => ({ start, candidates: [] });

function matching(names: readonly string[], typed: string): string[] {
  const lower = typed.toLowerCase();
  return [...new Set(names)]
    .filter((name) => name.toLowerCase().startsWith(lower) && name.toLowerCase() !== lower)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

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
  const earlier = before.slice(0, start).trim().toLowerCase();
  const first = earlier === "" || earlier === "roll";
  if (!first || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(typed)) return NONE(start);
  return { start, candidates: matching(data.presets, typed) };
}

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
