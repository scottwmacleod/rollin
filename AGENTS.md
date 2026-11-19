# rollin

Dice roller for tabletop RPGs: a TypeScript dice engine in `packages/engine` and a React web app in `apps/web`, live at rollin.scottmacleod.co (ADR-0008, ADR-0009). Domain terms are in `GLOSSARY.md`.

The rules every sm_ repo shares are in [`docs/agents/sm-conventions.md`](docs/agents/sm-conventions.md): definition of done, workflow, what to ask Scott first, the sm-core copy, CI, tests, writing and agent skills. This file adds what only applies to rollin, and wins where the two differ.

## Definition of done

`just check` passes (it runs `npm run check` plus the sm-core copy check, the same gates as the required `ci` check): the design-token drift check, typecheck, Biome, Vitest and Playwright with axe. Only `apps/web/src/ui` may import `@ui-sdk/*`. The parity fixtures in `packages/engine/fixtures/parity` are frozen; a change that alters one is a change to the engine's behaviour.

Typecheck runs `bun check --no-script` (Bun 1.4.4). `npm run typecheck:tsc` is the `tsc --noEmit` fallback; the weekly `tsc fallback` workflow runs it so a gap between the two shows up. If `bun check` misbehaves, switch the `typecheck` scripts back to `tsc --noEmit`.

Colour, type, spacing, radius and motion come from the sm-core copy (`vendor/sm-core/sm-core.css` and `sm-tailwind.css`), checked by `verify.mjs`. Only rollin's own sizes live in `ui/tokens.json`, which generates `--rollin-*` variables in `ui/tokens.css`; `npm run tokens:check` fails if they drift.

## Merging

PRs auto-merge through `.github/workflows/auto-merge.yml` once `ci` passes. A PR labelled `hold` waits for a human; the implement loop uses that label for its human stop.

## Agent skills

### Issue tracker

GitHub Issues for `scottwmacleod/rollin`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` plus `docs/adr/` at the root. See `docs/agents/domain.md`.

### Implement loop

Repo rules for `/implement`: queue, branch, PR and merge mechanics, limits, and human-stop triggers. See `docs/agents/implement.md`.

### Shared skills

The UI skills, Modern Web Guidance (agent-browser) and prune-tests live in `.claude/skills/`, with versions in `skills-lock.json`. When to use each, the pinned versions and the setup are in `sm-conventions.md`. Update them with `npx skills update -p -y`.

For browser checks in rollin, `npm run build && npm run preview --workspace rollin-web` serves the built app on port 4173.
