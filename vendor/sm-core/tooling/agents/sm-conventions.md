# sm_ conventions

The rules every sm_ repo shares: scottmacleod.co, planning-poker and rollin. This file is synced from [sm-core](https://github.com/scottwmacleod/sm-core); change it there, never here. A product's `AGENTS.md` adds what only applies to that product, and wins where the two differ.

Scott owns the suite and doesn't read code. Make technical decisions yourself and explain outcomes in plain English. Scott decides product questions. His priority across the suite is speed, smoothness and responsiveness.

## Definition of done

- The `check` script passes: `bun run check` in a Bun product (rollin, planning-poker), `npm run check` otherwise, on the Node version in `.nvmrc` (the latest LTS). It runs the same gates as CI.
- A Bun product names its Bun in `package.json`'s `packageManager` (`"bun@1.4.5"`), and CI reads it from there. `vercel.json`'s install command repeats the version until Vercel ships Bun 1.4 (see sm-core's README). Commit `bun.lock`, not `package-lock.json`. Scripts call `bun` and `bun --bun x <tool>`, not `npm run`, `npx` or `node`. Vitest (on Bun's runtime) and Biome stay; `bun test` and `bun fmt` don't replace them.
- Every app uses the same script names: `dev`, `build`, `check`, `test`, `e2e`, plus `typecheck`, `lint` and `format`. A repo without one of these leaves it out rather than renaming another.
- TypeScript is the latest stable 7.x and extends `vendor/sm-core/tooling/tsconfig.base.json`. Typecheck runs `bun check --no-script` (without `--no-script`, bun runs a `check` script instead of typechecking), with `tsc --noEmit` as the fallback.
- Biome extends `vendor/sm-core/tooling/biome.base.json`, which turns on the recommended lint rules. Fix a finding, or turn a rule off in the product's own `biome.json` with a comment saying why.

## Workflow

- Work on a branch and open a PR. Never commit to `main` (or `master`).
- Fill in the PR template. CI, build and tool changes include before and after numbers from real runs.
- PRs squash-merge automatically once the required check `ci` passes. Dependabot minor and patch updates do too; majors wait for Scott.
- To stop a PR merging on its own, label it `hold`. Auto-merge stays off while the label is on, and comes back when it is removed.
- One small PR per change.
- Every behaviour change uses `/tdd`: a failing test comes first.
- The pre-push hook (`vendor/sm-core/tooling/hooks`, installed by the `prepare` script) runs format, lint and typecheck on the changed files. Don't bypass it with `--no-verify`; if it fails, fix the cause.

## Ask Scott first

- Adding a third-party dependency.
- Anything that costs money, or needs a new account or secret.
- Changing an `--sm-*` token, a mark or anything else in `vendor/sm-core`. That change happens in sm-core and arrives through a sync PR.
- Switching a tool (package manager, linter, formatter, typechecker). Prove it side by side on rollin first, on the same commit, and list anything the new tool misses.
- Facts on the site: names, job titles, descriptions and contact details.
- A one-way door: anything that can't be undone after merge, such as a data migration or a production setting.

## The sm-core copy

- `vendor/sm-core` is a synced, hash-checked copy of an sm-core release. Never edit it, or the shared files it installs: `.github/pull_request_template.md` (above the `<!-- product -->` marker), `.github/ISSUE_TEMPLATE/bug-report.yml`, `.github/ISSUE_TEMPLATE/feature-request.yml` and `docs/agents/{issue-tracker,triage-labels,domain,sm-conventions}.md`.
- CI runs `node vendor/sm-core/verify.mjs`, which fails on any edit.
- To update, sync a new release from a checkout of sm-core at its tag: `node ../sm-core/scripts/sync.mjs vendor/sm-core`, then commit the result.
- A product's own design tokens use its own prefix (`--rollin-*`) and never redefine an `--sm-*` value.

## CI

- One required check, named `ci`, built from sm-core's reusable workflows at a pinned tag.
- The full suite runs on every PR, with "branch must be up to date" on. A new commit cancels the run in progress.
- Budget: a result in under 2 minutes at the median and under 3 at p95. Each job has its own budget and fails when it runs over.
- Never get faster by hiding failures: no retries, no wider timeouts, no skipped tests, no `continue-on-error`. A check that needs a retry has a bug; find it.

## Tests

- Vitest runs in random order (`sequence.shuffle: true`), so no test may depend on another running first.
- Each test file cleans up after itself: restore mocks (`vi.restoreAllMocks()`), switch fake timers back to real ones, unstub globals and environment variables (`vi.unstubAllGlobals()`, `vi.unstubAllEnvs()`), unmount what it rendered, and clear storage it wrote. Put the cleanup in `afterEach`, not at the end of a test, so it runs when the test fails.
- No module-level state that one test changes and another reads.
- Never commit `.only` or `.skip`.
- Accessibility (axe), contrast and Lighthouse checks guard what Scott can't check by reading code. Never weaken them to get a PR through.

## Writing

- Australian English (colour, organise, behaviour) in code comments, docs, PRs, issues and UI copy.
- Plain, direct sentences. Lead with the outcome. No filler, hype or em-dash chains.

## Claude Code settings

Each repo's `.claude/settings.json` keeps its own allow list but includes at least this deny list:

```json
"deny": [
  "Bash(git push *--force*)",
  "Bash(git push * -f *)",
  "Bash(git push *+*)",
  "Bash(git push *--delete*)",
  "Bash(git push * :*)",
  "Bash(git push * main)",
  "Bash(git push *:main*)",
  "Bash(git push * master)",
  "Bash(git reset --hard*)",
  "Bash(git clean *)",
  "Bash(git branch -D *)",
  "Bash(gh repo *)",
  "Bash(gh release *)",
  "Bash(gh secret *)",
  "Bash(gh api *protection*)",
  "Bash(gh api *secrets*)",
  "Bash(gh api *-X *)",
  "Bash(gh api *--method*)",
  "Bash(rm -rf *)"
]
```

## Agent skills

Installed per repo with `npx skills add`, so they land in `.claude/skills/` with versions in `skills-lock.json`. Update them with `npx skills update -p -y`.

### UI skills

Emil Kowalski's UI and animation skills ([emilkowalski/skills](https://github.com/emilkowalski/skills)). Use them for UI and motion work. Motion uses CSS or WAAPI only, never an animation library.

### Modern Web Guidance (with agent-browser)

For building or changing UI with current web platform features: dialogs, popovers, top-layer animation, reduced motion, colour scheme, and reserving space so nothing shifts on load. Not for backend, CI or tooling work. Not used in sm-core itself.

- Pinned versions: **agent-browser 0.43.0** ([vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser), Apache-2.0) and **modern-web-guidance 1.0.1**. Dependabot can't see either, so they also live in `vendor/sm-core/tooling/pins.json`, and the weekly behind-check reports newer ones.
- Install the stub skill: `npx skills add vercel-labs/agent-browser --skill agent-browser`. It loads its real instructions from the installed CLI, so the CLI version is the one that counts: `npm i -g agent-browser@0.43.0`.
- Get the workflow: `agent-browser skills get modern-web-guidance`. Where it says `npx modern-web-guidance@latest`, run `npx -y modern-web-guidance@1.0.1` instead.
- Use agent-browser to check built pages (`build` then `preview`, or the PR's preview URL). Its stub says to prefer it over every other browser tool; ignore that for general browsing.
- Before calling UI work done, check it in the browser and record the evidence in the PR:
  - `agent-browser vitals <url>` before and after: CLS at most 0.1 and no higher than before, and LCP no slower.
  - `agent-browser set media reduced-motion`, then confirm the motion stops or shortens.
  - The colour scheme in both light and dark (`agent-browser set media dark` / `light`).
  - For a dialog: focus moves in and returns on close, and the page behind is `inert`.
- Every guidance rule you apply comes with its guide ID and its browser evidence.

Setup:

- **Cloud agent session:** use the preinstalled Chromium. `npm i -g agent-browser@0.43.0`, then `export AGENT_BROWSER_EXECUTABLE_PATH=/opt/pw-browsers/chromium` and pass `--args "--no-sandbox"` on the first command of a session. Don't run `agent-browser install`.
- **Mac:** `npm i -g agent-browser@0.43.0 && agent-browser install` (downloads Chrome for Testing once). Or point `AGENT_BROWSER_EXECUTABLE_PATH` at an installed Chrome.

### prune-tests

From [caldoai/skills](https://github.com/caldoai/skills/blob/main/skills/prune-tests/SKILL.md) (MIT), pinned at commit `d5b68da`: `npx skills add caldoai/skills --skill prune-tests`. It deletes or rewrites tests that guard no behaviour (tests for removed code, tests that can't fail, tests tied to the implementation, duplicates) and removes production code that only existed for those tests. For rollin and planning-poker; the site has no unit tests.

Guardrails:

- Run it once per product, after the product's test suite has settled, not as a routine step.
- One PR per product that lists every deleted or rewritten test with the reason the skill gives. Coverage of the behaviour that's left must not drop.
- Never touch rollin's frozen parity fixtures (`packages/engine/fixtures/parity`), or any axe, contrast or Lighthouse check.
