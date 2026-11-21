# Lint with bun lint, format with bun fmt

**Supersedes [ADR-0011](0011-keep-biome-over-oxlint-and-oxfmt.md).** Decided by Scott on 2026-11-21 in the CI speed brief. The suite-wide record, with every rule turned off and why, is sm-core's ADR-0009.

- `bun lint` lints JavaScript and TypeScript with every rule in `vendor/sm-core/tooling/oxlintrc.base.json` (704, type-aware). `.oxlintrc.json` adds rollin's ignores and the offs ADR-0020 explains. It runs from the pinned canary, `bun@1.4.5-canary.20261120.1`, because no stable Bun has it yet.
- The 2,033 findings the code already had are in `oxlint-suppressions.json`. New code meets every rule. `bun lint` fails on a new finding and on a suppression that no longer matches, so the file only shrinks.
- `bun fmt` formats everything outside `vendor`, the synced files, the frozen parity fixtures and generated code, with `.oxfmtrc.json` from sm-core: 100 columns and sorted imports, as Biome had. Moving to it reformatted 34 files, mostly `.map((p): T => ({…}))` callbacks onto one line, wrapped `unicode-range` lists and Markdown tables.
- Biome stays, for what `bun lint` can't check: the recommended CSS rules and 9 JavaScript rules (sm-core's ADR-0009 lists them). It runs `biome lint`, with its formatter and import sorting off.

## Side by side, same commit, 4-core cloud machine, median of 5 warm runs

| Step                              | Before                               | After                                                           |
| --------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `bun run lint` (everything below) | 233 ms (`biome check` + no-comments) | 571 ms                                                          |
| JS/TS lint                        | Biome, 219 rules                     | `bun lint`, 704 rules type-aware: 371 ms (106 ms without types) |
| CSS lint                          | Biome                                | Biome, CSS + 9 JS rules: 82 ms                                  |
| Format check                      | Biome                                | `bun fmt --check`: 15 ms                                        |

Lint is slower because it checks over three times as many rules, half of them with types. It stays under the brief's 1-second budget. The first run on a machine also downloads the canary (1.3 s, 154 MB cached in Bun's install cache).
