# @rollin/engine

The rollin dice engine in TypeScript: no UI, no browser APIs. Randomness comes in through a `DieSource` (ADR-0003), so tests script the dice.

```ts
import { roll } from "@rollin/engine";

const report = roll("4d6dl1 # strength", dieSource);
```

## Tests

`npm test --workspace @rollin/engine` runs three suites:

- **`roll.test.ts`**: behaviour per glossary concept.
- **`properties.test.ts`**: fast-check properties, plus a fuzz over random valid formulas that must never throw or hang.
- **`parity.test.ts`**: replays the frozen fixtures in `fixtures/parity/*.json`, recorded from the Rust engine this project used to have. Each case scripts the recorded dice and expects the same result tree, the same dice requested in the same order and every draw used. The fixtures are no longer regenerated: a change that alters one is a change to the engine's behaviour. `fixtures/parity/README.md` describes the format.

## Parity coverage

Every fixture area is covered: arithmetic, dice, keep and drop, exploding, rerolls, success counting, labels and repeats, limits, errors, presets, characters, d20 checks and D&D 5e.

Two `errors` cases differ on purpose (`overflow_add`, `overflow_mul`): this engine keeps every number inside JavaScript's safe integers, so it reports "number is too large" where the Rust engine's 64-bit sums overflowed. `DIVERGENT` in the parity test records what it says instead.

## Property tests

The properties of the former Rust proptest suite (totals within bounds, kept-dice counts, success-count arithmetic, limits never exceeded, preset names) each have a fast-check equivalent. Preset names and rolling a preset by name are in `presets.test.ts`.
