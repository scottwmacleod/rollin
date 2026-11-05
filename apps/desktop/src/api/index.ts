import { invoke } from "@tauri-apps/api/core";
import type { About, Completions, Execution, Failure, SessionState } from "./types";

export type * from "./types";

/**
 * Runs one typed line as the REPL would: rolls, `save`, `set`, `char`, and
 * the session words `help` and `history`. A command error resolves as
 * `{ status: "error", ... }` rather than rejecting.
 */
export function execute(line: string): Promise<Execution> {
  return invoke<Execution>("execute", { line });
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Completion candidates for the word ending at `pos`, a UTF-16 index into
 * `line` (as `selectionStart` gives). The library counts UTF-8 bytes, so
 * this converts each way; that is the only work done here.
 */
export async function complete(line: string, pos: number): Promise<Completions> {
  const bytePos = encoder.encode(line.slice(0, pos)).length;
  const result = await invoke<{ start: number; candidates: string[] }>("complete", {
    line,
    pos: bytePos,
  });
  const head = decoder.decode(encoder.encode(line).slice(0, result.start));
  return { start: head.length, candidates: result.candidates };
}

/** Resolves if `formula` (or a preset name) would roll; rejects with a `Failure`. */
export function check(formula: string): Promise<void> {
  return invoke<null>("check", { formula }).then(() => undefined);
}

/** The sidebar's data. Rejects with a `Failure` (for example, no config directory). */
export function state(): Promise<SessionState> {
  return invoke<SessionState>("state");
}

/**
 * Seeds the session RNG: `n` gives the stream `rollin --seed n` gives in a
 * REPL; `null` goes back to entropy. Returns the new state's seed.
 */
export function setSeed(seed: number | null): Promise<number | null> {
  return invoke<number | null>("set_seed", { seed });
}

/** Name, versions (from the build), licence and repository for the About view. */
export function about(): Promise<About> {
  return invoke<About>("about");
}

/** Restarts the app into an installed update; the page goes away with it. */
export function relaunch(): Promise<void> {
  return invoke<void>("relaunch_app");
}
