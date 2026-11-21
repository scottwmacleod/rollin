export type HistoryNav = { at: number; draft: string } | null;

export function pastFormulas(inputs: string[]): string[] {
  const out: string[] = [];
  for (let i = inputs.length - 1; i >= 0; i--) {
    const text = inputs[i];
    if (text !== undefined && text !== out[out.length - 1]) out.push(text);
  }
  return out;
}

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
