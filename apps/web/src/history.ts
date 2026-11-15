/** Shell-style history for the formula box: Up steps back through past rolls, Down comes forward again. */

/** Where the box is in the history. `null` means the person is typing, not browsing. */
export type HistoryNav = { at: number; draft: string } | null;

/** Past formulas, newest first, with a repeat of the one just before it dropped. */
export function pastFormulas(inputs: string[]): string[] {
  const out: string[] = [];
  for (let i = inputs.length - 1; i >= 0; i--) {
    const text = inputs[i];
    if (text !== undefined && text !== out[out.length - 1]) out.push(text);
  }
  return out;
}

/**
 * One press of Up or Down. Returns the new position and the text to show, or
 * `null` when the key does nothing (no history, already at the oldest, or Down
 * while typing). Down past the newest returns the draft that was typed before
 * Up was first pressed.
 */
export function stepHistory(
  past: string[],
  nav: HistoryNav,
  direction: "up" | "down",
  current: string,
): { nav: HistoryNav; text: string } | null {
  if (direction === "up") {
    const at = nav === null ? 0 : nav.at + 1;
    const text = past[at];
    if (text === undefined) return null;
    return { nav: { at, draft: nav === null ? current : nav.draft }, text };
  }
  if (nav === null) return null;
  if (nav.at === 0) return { nav: null, text: nav.draft };
  const text = past[nav.at - 1];
  if (text === undefined) return { nav: null, text: nav.draft };
  return { nav: { at: nav.at - 1, draft: nav.draft }, text };
}
