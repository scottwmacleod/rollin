# Parity fixtures

Real rolls recorded from the Rust engine this project used to have, written as JSON so the TypeScript engine can prove it rolls the same way. The Rust engine is gone (ADR-0009), so these files are **frozen**: nobody regenerates them, and they are the engine's regression suite. A change that makes a case fail is a change to the engine's behaviour, and needs the same care as changing a formula's meaning.

`packages/engine/src/parity.test.ts` replays every case.

## What a case is

Each file holds one area (`arithmetic`, `d20_checks`, `errors` and so on):

```json
{
  "format_version": 1,
  "area": "dnd5e",
  "about": "One line on what the area covers.",
  "cases": [ ... ]
}
```

A case is one typed line run against one context:

```json
{
  "name": "hit_doubles_damage",
  "line": "d20+5, 1d8+3",
  "context": { "character": { "name": "hero", "system": "dnd5e", "vars": {}, "presets": {} } },
  "draws": [
    { "sides": 20, "face": 20 },
    { "sides": 8, "face": 6 },
    { "sides": 8, "face": 6 }
  ],
  "expected": { "ok": { "kind": "rolls", "rolls": [ ... ], "hints": [], "lines": [], "preset": null } }
}
```

| Field      | Meaning                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | Unique within its file.                                                                                                                       |
| `line`     | What the player typed: a formula, or a lone word naming a preset (optionally after `roll`). It is split on whitespace like a line in the app. |
| `context`  | What the line runs against. Omitted when it is empty: the `default` character, no presets, no game system.                                    |
| `draws`    | Every die the engine drew, in draw order.                                                                                                     |
| `expected` | Either `{ "ok": ... }` or `{ "error": ... }`.                                                                                                 |

### `context`

All fields are optional.

| Field                  | Meaning                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `character.name`       | The active character.                                                                             |
| `character.system`     | Its game system. Only `"dnd5e"` exists.                                                           |
| `character.crit_range` | Its crit range, 2 to 20. Absent means 20.                                                         |
| `character.vars`       | Its variables, name to integer. Names are lowercase.                                              |
| `character.presets`    | Its presets, name to formula.                                                                     |
| `global_presets`       | Presets every character can roll. A character's own preset of the same name shadows a global one. |
| `default_system`       | The global default game system, used by a character that names none.                              |

### `draws`

The engine asks for a die by its number of sides and gets a face from 1 to
`sides`. A case records each of those asks, in order, so the TypeScript engine
can replay them through a scripted die source instead of re-implementing
ChaCha8. To check a case:

1. Give the engine a die source that hands out `draws` in order.
2. Roll `line` in `context`.
3. Every ask must match the next draw's `sides`, and every draw must be used
   by the time the roll finishes. A roll that fails part of the way through
   (a cap hit after some dice, a divisor that rolled 0) records the dice drawn
   up to the failure, and no more.
4. The result must equal `expected`.

Draws cover everything the engine rolls, including dice a reroll threw away
and extra dice from explosions, so a case can have more draws than dice in the
result. A compounded explosion (`!!`) or penetrating one (`!p`) is one die in
the result with several draws behind it.

### `expected`

The shape is the engine's public result data (`packages/engine/src/types.ts`):

- `ok`: an `OutputReport` for a roll. `rolls` is the list of roll results (the
  `Roll` type: `formula`, `total`, `expr` tree, and `kind`, `label`,
  `iteration`, `crit` and `doubled` when set). `preset` is `[name, formula]`
  when the line rolled a preset, else `null`. `hints` and `lines` are
  alongside; both are empty for a roll.
- `error`: an `ErrorReport`: the error's own fields and its `kind` tag, plus
  `message` (the neutral one-line text) and `hints`. Formula errors carry the
  byte `span` of the offending text.

Fields that are unset are left out, exactly as the engine serialises them.
Object keys are written in sorted order, so compare parsed JSON, not text.

## What the areas cover

| File               | Covers                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `arithmetic`       | Numbers, operators, precedence, groups, negation, integer division.                                                     |
| `dice`             | Plain groups, `d%`, the v1 formulas.                                                                                    |
| `keep_drop`        | `kh`, `kl`, `dh`, `dl`, `adv`, `dis`, and their errors.                                                                 |
| `exploding`        | `!`, `!!`, `!p`, conditions, the 100-explosion cap at and over the boundary.                                            |
| `rerolls`          | `r`, `rr`, conditions, combinations with explode and drop, the 100-reroll cap.                                          |
| `success_counting` | `>=`, `=`, `<=`, failures with `f`, and counts used in arithmetic (an error).                                           |
| `labels_repeats`   | `# label`, comma lists, `Nx` repeats, and their errors.                                                                 |
| `limits`           | Every hard cap, as the error it gives.                                                                                  |
| `errors`           | Syntax, dice, division by zero, overflow, undefined variables and unknown presets, with their hints.                    |
| `characters`       | `@variable` in every position a number can go.                                                                          |
| `presets`          | Rolling a preset, shadowing, variables resolved when rolled, near misses.                                               |
| `d20_checks`       | The d20 check rule, with every crit face.                                                                               |
| `dnd5e`            | Crit hits and misses, damage doubling, the `atk` and `dmg` markers, repeats, `crit` suffix, crit range, default system. |

### The d20 check rule

A check is `1d20`, or `2d20` keeping one die (`adv`, `dis`, `kh1`, `kl1`,
`dl1`, `dh1`). Under a game system a check pairs as an attack and can crit; the
kept die is flagged `natural` on a 20 or a 1. `d20_checks` has, for every
check form, a natural 20, a natural 1 and a face between, plus the dropped-die
cases (a 20 or a 1 on a die that did not count is nothing).

Never a check, even when a 20 or a 1 comes up: `3d20`, a bare `2d20`, a lone
`d20!` or `d20!!`, a pair with an explode clause (`2d20!kh1`), success counts, and `d20+d20`. Those cases are named
`not_a_check_*` and expect no `crit`, no `natural` and no doubled damage.

## Where the TypeScript engine differs

The Rust engine did its sums in 64-bit integers. The TypeScript engine keeps
every number inside JavaScript's safe integers (2^53 - 1), so a total never
loses precision. Two cases in `errors` (`overflow_add`, `overflow_mul`) therefore
give "number is too large" in TypeScript where Rust gave an overflow. The
harness in `packages/engine/src/parity.test.ts` names them and the answer it
expects instead.

## Adding a case

Add a case to the JSON file for its area: a `name` unique within the file, the
`line`, an optional `context`, the `draws` (the dice, in order, that the roll
will ask for) and the `expected` result. Cases added after the Rust was deleted
are written by hand, so check the expected tree against the formula reference
in `docs/formulas.md` rather than copying whatever the engine returns.
