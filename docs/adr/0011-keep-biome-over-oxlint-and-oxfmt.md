# Keep Biome over oxlint and oxfmt

rollin keeps Biome for formatting and linting. oxlint 1.94.0 and oxfmt 0.79.0 were run beside Biome 2.6.7 on the same commit (#300). Decided on 2026-11-18.

**Speed.** Every tool finishes the whole repo in about a tenth of a second, so none is clearly faster in practice. Median of five warm runs, first run on a fresh clone in brackets:

| Tool | Does | Warm | First run |
| --- | --- | --- | --- |
| `biome check .` | format and lint | 99 ms | 105 ms |
| `oxlint` | lint | 54 ms | 55 ms |
| `oxfmt --check` | format | 72 ms | 124 ms |

oxlint plus oxfmt (about 125 ms) is no faster than Biome doing both (about 100 ms).

**Rules.** Biome currently lints nothing: `biome.json`, like sm-core's `biome.base.json`, sets `"preset": "none"`. A planted `debugger`, unused variable and `== NaN` all passed `biome lint`; oxlint's defaults flagged all three. On the current code oxlint's defaults find two real problems Biome can't, because it isn't asked to:

- `packages/engine/src/index.ts:8`: `spanOf` is imported but never used (`no-unused-vars`).
- `packages/engine/src/properties.test.ts:262`: unsafe optional chaining that would throw if it short-circuits (`no-unsafe-optional-chaining`).

**Format.** With the settings migrated from Biome (`oxfmt --migrate=biome`), oxfmt would change 5 of 96 files, 41 lines added and 44 removed: it collapses `.map((p): T => ({...}))` callbacks onto one line in `palette.ts` and `presets.ts`, wraps one long `<meta>` in `index.html`, and reorders keys in two `package.json` files. Small.

**Why keep Biome.** The ticket's bar is "clearly faster", and at this size neither is. Switching would also mean two tools and two configs where one does both, in all three repos. The gap this trial found is in our config, not in Biome. With `"preset": "recommended"` on the same commit, Biome flags all three planted problems and both real findings above, plus 18 more (10 accessibility rules, 5 array-index React keys, 2 type-only imports, 1 nested function declaration). Turning on Biome's recommended rules in sm-core's base is the better fix, and it's tracked in scottwmacleod/sm-core#16, because it changes all three products.

**Revisit if** the repo grows enough that lint time shows up in CI, or Biome's recommended rules miss something oxlint catches.
