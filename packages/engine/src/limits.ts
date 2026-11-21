import type { Cap } from "./types";

export const MAX_DICE_PER_TERM = 1000;
export const MAX_EXPLOSIONS_PER_DIE = 100;
export const MAX_REROLLS_PER_DIE = 100;
export const MAX_DICE_PER_ROLL = 10000;
export const MAX_DEPTH = 32;
export const MAX_REPEAT = 100;
export const MAX_SIDES = 10000;

export const MAX_INT = Number.MAX_SAFE_INTEGER;

export const CAP_LIMITS: Record<Cap, number> = {
  dice_per_term: MAX_DICE_PER_TERM,
  explosions_per_die: MAX_EXPLOSIONS_PER_DIE,
  rerolls_per_die: MAX_REROLLS_PER_DIE,
  dice_per_roll: MAX_DICE_PER_ROLL,
  nesting_depth: MAX_DEPTH,
  repeat: MAX_REPEAT,
};
