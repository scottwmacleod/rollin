import { type DieSource, type Draw, scriptedDice } from "@rollin/engine";

const RANGE = 2 ** 32;

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
    __rollinDice?: Draw[];
  }
}

let scripted: DieSource | undefined;

export function dieSource(): DieSource {
  if (import.meta.env.MODE === "e2e" && window.__rollinDice) {
    scripted ??= scriptedDice(window.__rollinDice);
    return scripted;
  }
  return cryptoDice;
}
