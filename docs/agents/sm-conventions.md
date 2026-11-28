# sm_ conventions

The rules every sm_ repo shares: scottmacleod.co, planning-poker and rollin. This file is synced from [sm-core](https://github.com/scottwmacleod/sm-core); change it there, never here. A product's `AGENTS.md` adds what only applies to that product, and wins where the two differ.

Scott owns the suite and doesn't read code. Make technical decisions yourself and explain outcomes in plain English. Scott decides product questions. His priority across the suite is speed, smoothness and responsiveness.

## Definition of done

- The `check` script passes: `bun run check` in a Bun product (rollin, planning-poker), `npm run check` otherwise, on the Node version in `.nvmrc` (the latest LTS). It runs the same gates as CI.
- A Bun product names its Bun in `package.json`'s `packageManager` (`"bun@1.4.5"`), and CI reads it from there. `vercel.json`'s install command repeats the version until Vercel ships Bun 1.4 (see sm-core's README). Commit `bun.lock`, not `package-lock.json`. Scripts call `bun` and `bun --bun x <tool>`, not `npm run`, `npx` or `node`. Unit tests run on `bun test --parallel`, and test files keep their `vitest` imports (Bun maps them to `bun:test`); a product's `test/` setup adds the `vi` and `expect` helpers Bun lacks.
- Every app uses the same script names: `dev`, `build`, `check`, `test`, `e2e`, plus `typecheck`, `lint` and `format`. A repo without one of these leaves it out rather than renaming another.
- TypeScript is the latest stable 7.x and extends `vendor/sm-core/tooling/tsconfig.base.json`. Typecheck runs `bun check --no-script` (without `--no-script`, bun runs a `check` script instead of typechecking), with `tsc --noEmit` as the fallback.
- `bun lint` lints JavaScript and TypeScript. A product's `.oxlintrc.json` extends `vendor/sm-core/tooling/oxlintrc.base.json`, which turns on every rule except those sm-core's ADR-0010 gives a reason for. `bun lint` is only in Bun's canary: run it as `bun x bun@1.4.5-canary.20261120.1 lint --no-script` until a stable Bun has it. Findings that predate a rule sit in `oxlint-suppressions.json`, which may only shrink; fix the code rather than adding to it (`--suppress-all` is for turning a new rule on, never for new code). Turn a rule off in the product's own `.oxlintrc.json` only with an ADR that says why.
- `bun fmt` formats everything, with the `.oxfmtrc.json` sync installs. Biome runs `biome lint` for CSS and the few JavaScript rules `bun lint` lacks, from `vendor/sm-core/tooling/biome.base.json`.

## Workflow

- Work on a branch and open a PR. Never commit to `main` (or `master`).
- Fill in the PR template. CI, build and tool changes include before and after numbers from real runs.
- PRs squash-merge automatically once the required check `ci` passes. Dependabot minor and patch updates do too; majors wait for Scott.
- To stop a PR merging on its own, label it `hold`. Auto-merge stays off while the label is on, and comes back when it is removed.
- One small PR per change.
- Every behaviour change uses `/tdd`: a failing test comes first.
- The main flow for new work: `/grill-with-docs` to agree what to build (it keeps `GLOSSARY.md` and `docs/adr/` current), then `/to-spec` and `/to-tickets` for anything bigger than one session, then `/implement` per ticket with `/clear` between tickets. Keep the grilling, spec and tickets in one unbroken context, and compact at a phase boundary rather than past about 150k tokens. A product's `docs/agents/implement.md` holds its `/implement` rules.
- `/improve-codebase-architecture` every few days on a product with real code (rollin, planning-poker). A candidate you pick goes into the main flow at `/grill-with-docs`.
- Git hooks run through hk (`hk.pkl`, installed by the `prepare` script): pre-commit formats and lints the staged files, pre-push runs `check`, the same command as CI. Don't bypass them with `--no-verify`; if one fails, fix the cause. Keep the `format` and `lint` scripts accepting file paths.

## After you open a PR

- Before you push, run `/code-review` on the branch and fix the findings that hold up. It reads `CLAUDE.md`, which imports `AGENTS.md`.
- Look after the PR until it merges with the built-in `/steward <n>`: failing checks, merge conflicts and review comments. Follow [`looking-after-prs.md`](looking-after-prs.md), including when to stop and hand it back.
- The flow, in public and private repos alike: `/tdd` to build, commit, `/code-review`, `/pr` to write and open the PR, then `/steward <n>` to watch it until it merges. In a cloud session, subscribe to the PR's activity instead of `/steward`. Don't use `/ship`: it writes its own PR description instead of `/pr`'s, and in a public repo it commits nothing.
- When the same review comment turns up on two PRs, make it a rule in its own PR: shared rules here (through sm-core), product rules in `AGENTS.md`, PR-handling rules in `looking-after-prs.md`. Delete a rule that stops earning its place.

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

- Tests run in random order (`randomize = true` in `bunfig.toml`, or `sequence.shuffle: true` where Vitest remains), and each file gets a fresh global (`bun test --parallel`), so no test may depend on another running first.
- Each test file cleans up after itself: restore mocks (`vi.restoreAllMocks()`), switch fake timers back to real ones, unstub globals and environment variables (`vi.unstubAllGlobals()`, `vi.unstubAllEnvs()`), unmount what it rendered, and clear storage it wrote. Put the cleanup in `afterEach`, not at the end of a test, so it runs when the test fails.
- No module-level state that one test changes and another reads.
- Never commit `.only` or `.skip`.
- Accessibility (axe), contrast and Lighthouse checks guard what Scott can't check by reading code. Never weaken them to get a PR through.

## Writing

- Australian English (colour, organise, behaviour) in docs, PRs, issues and UI copy.
- No code comments. Put the reason in a name, a test, an ADR (`docs/adr/`) or the PR, and usage in the README. `vendor/sm-core/tooling/lint/no-comments.mjs` fails on a new comment; its ratchet, `comments-baseline.json`, only goes down. After deleting comments, run it with `--update` and commit the baseline. `/delete-comment` clears a backlog; before deleting a comment, find out why it was written.
- Plain, direct sentences. Lead with the outcome. No filler, hype or em-dash chains.

## Claude Code settings

Each repo's `.claude/settings.json` keeps its own allow list but includes at least this deny list. The repo copy is what protects cloud sessions and other machines, which don't read `~/.claude/settings.json`:

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

Matt Pocock's skills come from the `mattpocock-skills` plugin, enabled in each repo's `.claude/settings.json`. The rest are installed per repo with `npx skills add`, so they land in `.claude/skills/` with versions in `skills-lock.json`. Update them with `npx skills update -p -y` in every product in the same sitting, so the copies don't drift.

### UI skills

Emil Kowalski's UI and animation skills ([emilkowalski/skills](https://github.com/emilkowalski/skills)). Use them for UI and motion work. Motion uses CSS or WAAPI only, never an animation library.

### UI work in the browser

Before building or changing UI (dialogs, popovers, motion, colour scheme, layout shift), read [`ui-browser-checks.md`](ui-browser-checks.md): the pinned agent-browser and Modern Web Guidance setup, and the browser evidence a UI PR must carry. Not for backend, CI or tooling work, and not used in sm-core itself.

### prune-tests

Before running `/prune-tests`, read [`prune-tests.md`](prune-tests.md) for its pin and guardrails. It runs once per product, never as a routine step.
