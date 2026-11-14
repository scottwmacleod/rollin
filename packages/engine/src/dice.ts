/**
 * The die source (ADR-0003). The engine never reaches for randomness itself: it
 * asks a `DieSource` for each die, so production passes `crypto.getRandomValues`
 * and tests pass a script.
 */

/** Rolls one die with `sides` faces and returns a face from 1 to `sides`. */
export type DieSource = (sides: number) => number;

/** One die the engine asked for, and the face it got. */
export interface Draw {
  sides: number;
  face: number;
}

/**
 * Hands out `draws` in order. Each ask must match the next draw's `sides`, and
 * `remaining()` says how many draws the roll left unused.
 */
export function scriptedDice(draws: readonly Draw[]): DieSource & { remaining(): number } {
  let next = 0;
  const source = (sides: number): number => {
    const draw = draws[next];
    if (draw === undefined)
      throw new Error(`the roll asked for a d${sides} but the script is empty`);
    if (draw.sides !== sides) {
      throw new Error(`the roll asked for a d${sides} but the script has a d${draw.sides} next`);
    }
    next += 1;
    return draw.face;
  };
  return Object.assign(source, { remaining: () => draws.length - next });
}
