# Keep npm over bun for installs

**Superseded by [ADR-0012](0012-switch-to-bun.md)** on 2026-11-20.

rollin keeps npm as its package manager. bun was trialled side by side on the same commit (#299, PR #310) and was faster, but not by enough to pay for switching the whole suite. Decided on 2026-11-18. Bun stays in use as the typechecker (`bun check --no-script`, #301); that choice is separate.

**Numbers.** rollin's two workspaces, 78 packages, Node 26.13.1, bun 1.4.4, npm 10.9.9. CI is ten jobs per tool on `ubuntu-latest` in one run; GitHub reports step times in whole seconds. Cold means an empty package cache; warm means the package cache restored from `actions/cache` (restore plus install).

| | npm p50 | npm p95 | bun p50 | bun p95 |
| --- | --- | --- | --- | --- |
| CI cold | 3.5 s | 4.0 s | 1.0 s | 1.0 s |
| CI warm (restore + install) | 4.0 s | 4.5 s | 2.0 s | 3.5 s |
| Local cold (3 runs) | 4.8 s | 4.9 s | 3.8 s | 9.1 s |
| Local warm (3 runs) | 3.3 s | 3.4 s | 0.02 s | 0.02 s |

`bun install --frozen-lockfile` left `bun.lock` unchanged in all 20 CI runs, and every gate passed on a bun-installed tree (token check, typecheck, Biome, Vitest 391 + 124, Playwright with axe 101).

**Why not switch.** The shared CI (`sm-core`'s `web-ci.yml`) caches the whole `node_modules` keyed on the lockfile, so the install only runs on a cache miss, and then once per job in parallel. bun would save about 2.5 seconds of wall time on those runs and nothing on the rest, against a CI budget of 2 minutes. Switching would mean changing every shared workflow that installs (`web-ci`, `budgets`), replacing `npm audit`, moving Dependabot to its bun ecosystem, changing Vercel's `installCommand` here, and the same in planning-poker beside Wrangler. That is a lot of moving parts in three repos for a gain nobody would notice.

**Revisit if** install time becomes a real share of CI (a cache miss on most runs, or a much larger dependency tree), or the shared workflows gain a package-manager input for another reason.
