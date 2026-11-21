export type DieSource = (sides: number) => number;

export interface Draw {
  sides: number;
  face: number;
}

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
