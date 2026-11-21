# Switch to Bun as package manager and runtime

**Supersedes [ADR-0010](0010-keep-npm-over-bun-for-installs.md).** Decided by Scott on 2026-11-20, from the trial in #352. Suite spec: scottwmacleod/sm-core#35.

rollin uses Bun 1.4.4 to install packages and to run every script and tool. `bun.lock` is committed, `package-lock.json` is gone, and `packageManager: "bun@1.4.4"` in `package.json` is the one place the version lives. Scripts call `bun run`, `bun <file>` and `bun --bun x <tool>`; the `--bun` flag makes tools such as Vite, Vitest and Playwright run on Bun's runtime instead of Node.

**Numbers.** The whole toolchain on npm 10 and Node 26 against Bun 1.4.4, same commit, on `ubuntu-latest` (run 44716699232, six npm and seven Bun jobs). Medians:

| Step                                    | npm + Node | Bun    | Saved                                |
| --------------------------------------- | ---------- | ------ | ------------------------------------ |
| Install, empty cache                    | 3.35 s     | 0.61 s | 2.7 s                                |
| Install, warm cache                     | 2.25 s     | 0.05 s | 2.2 s                                |
| Token check                             | 0.03 s     | 0.01 s | 0                                    |
| Typecheck (`bun check` both ways)       | 0.24 s     | 0.22 s | 0                                    |
| Biome lint (same both ways)             | 0.33 s     | 0.38 s | 0                                    |
| Vitest, engine                          | 2.11 s     | 1.52 s | 0.6 s                                |
| Vitest, web                             | 1.54 s     | 1.21 s | 0.3 s                                |
| Vite build                              | 1.00 s     | 0.86 s | 0.1 s                                |
| Dev server ready                        | 0.49 s     | 0.23 s | 0.3 s                                |
| Playwright (131 tests, incl. its build) | 75.7 s     | 68.9 s | 6.8 s (noisy: npm ranged 63 to 84 s) |

ADR-0010 judged the install gain too small to pay for changing the shared workflows. This time the runtime was measured too, and Bun was as fast or faster at every step. The shared workflows now take a `package-manager` input, which was one of ADR-0010's conditions to revisit.

**What stays.**

- **Vitest**, run on Bun's runtime (`bun --bun vitest run`). `bun test` failed 13 of 74 web test files without rework.
- **Biome** for lint and format (ADR-0011). Bun has no linter, and `bun fmt` lays out 4 files differently from Biome.
- **Node in CI**, only for `node vendor/sm-core/verify.mjs`, which stays dependency-free and runs on either.

**Consequences.**

- CI (`web-ci`, `budgets`, `audit`) runs with `package-manager: bun`: Bun from `packageManager`, caches keyed on `bun.lock`, `bun install --frozen-lockfile`, and `bun audit`.
- Vercel's bundled Bun is 1.3.14, which can't read a Bun 1.4 `bun.lock`, so `installCommand` installs Bun 1.4.4 with the official installer first, and `buildCommand` calls that binary. Drop this once Vercel ships Bun 1.4. `npm i -g bun` doesn't work there, because npm 12 blocks Bun's postinstall.
- Dependabot uses its `bun` ecosystem.
- To change the Bun version, edit `packageManager` and the two Bun version strings in `vercel.json`.
