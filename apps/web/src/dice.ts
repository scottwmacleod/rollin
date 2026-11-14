import { type DieSource, type Draw, scriptedDice } from "@rollin/engine";

const RANGE = 2 ** 32;

/**
 * Fair dice from the browser's cryptographic generator (ADR-0003). A plain
 * `value % sides` favours low faces whenever `sides` does not divide 2^32, so
 * draws in the uneven tail are thrown away and redrawn.
 */
export const cryptoDice: DieSource = (sides) => {
  const limit = RANGE - (RANGE % sides);
  const draw = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(draw);
    value = draw[0] as number;
  } while (value >= limit);
  return 1 + (value % sides);
};

declare global {
  interface Window {
    /** Test builds only: the dice the page should roll, in order. */
    __rollinDice?: Draw[];
  }
}

let scripted: DieSource | undefined;

/**
 * The die source for a roll. Test builds (`vite build --mode e2e`) may script
 * the dice through `window.__rollinDice`; the production build drops that
 * branch entirely, and `scripts/check-no-test-hooks.mjs` checks it did.
 */
export function dieSource(): DieSource {
  if (import.meta.env.MODE === "e2e" && window.__rollinDice) {
    scripted ??= scriptedDice(window.__rollinDice);
    return scripted;
  }
  return cryptoDice;
}
