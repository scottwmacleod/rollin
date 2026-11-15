# @rollin/engine

The rollin dice engine in TypeScript: no UI, no browser APIs. Randomness comes in through a `DieSource` (ADR-0003), so tests script the dice.

```ts
import { roll } from "@rollin/engine";

const report = roll("4d6dl1 # strength", dieSource);
```

## Tests

`npm test --workspace @rollin/engine` runs three suites:

- **`roll.test.ts`**: behaviour per glossary concept.
- **`properties.test.ts`**: fast-check properties, ported from the Rust `tests/properties.rs`, plus a fuzz over random valid formulas that must never throw or hang.
- **`parity.test.ts`**: replays the Rust engine's fixtures (`tests/fixtures/parity/*.json`). Each case scripts the dice the Rust engine drew and expects the same result tree, the same dice requested in the same order and every draw used.

## Parity coverage

| Fixture group                                           | Cases | Status                                    |
| ------------------------------------------------------- | ----- | ----------------------------------------- |
| `arithmetic`, `dice`, `limits`                          | 43    | covered                                   |
| `keep_drop`, `exploding`, `rerolls`, `success_counting` | 73    | covered                                   |
| `labels_repeats`                                        | 18    | covered                                   |
| `errors`                                                | 35    | covered, except the cases listed below    |
| `presets`                                               | 15    | waits for presets (#229)                  |
| `characters`                                            | 15    | waits for characters and variables (#232) |
| `d20_checks`, `dnd5e`                                   | 95    | wait for the 5e game system (#234)        |

Two `errors` cases differ on purpose (`overflow_add`, `overflow_mul`): this engine keeps every number inside JavaScript's safe integers, so it reports "number is too large" where the Rust engine's 64-bit sums overflowed. `DIVERGENT` in the parity test records what it says instead.

`DEFERRED_AREAS` and `DEFERRED_CASES` in the parity test name each waiting case and the ticket that brings it. A test fails if a name there no longer exists in the fixtures, so the lists cannot go stale. `errors/session_word_one_shot` is a command-line message ("run `rollin` with no arguments"); it has no meaning in the web app and goes when the CLI is deleted (#239).

## Property tests

Each Rust property test has a fast-check equivalent, except the ones that wait on a later ticket: preset names and the command parser (#229) and variables (#232).
