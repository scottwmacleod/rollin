# Dice read the way players say them

Recorded on 2026-11-21 from the code comments they replace.

**Fair dice.** The web app draws dice from `crypto.getRandomValues` ([ADR-0003](0003-library-core-with-injected-rng.md)). A plain `value % sides` favours low faces whenever `sides` doesn't divide 2^32, so `apps/web/src/dice.ts` throws away draws in the uneven tail and draws again.

**Explosions.** The engine marks the extra die an explosion added as `exploded`. The roll line marks the die that exploded instead (the 6 of `2d6!`), because that's how players say it; the extra die follows it and counts like any other. A compounded die (`!!`) exploded when it holds more than one roll (`apps/web/src/breakdown.ts`).

**Attacks and damage.** Under a game system, a d20 check is only an attack when damage follows it before the next check, or when it's marked `atk`. Only an attack can crit. A lone check, such as a skill check or a save, gets no verdict, though its die is still natural. Pairing starts over for each `Nx` repeat. With no game system every roll stands alone (`packages/engine/src/index.ts`).
