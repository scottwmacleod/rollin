# rollin

Dice roller for tabletop RPGs: a TypeScript dice engine in `packages/engine` and a React web app in `apps/web`, live at rollin.scottmacleod.co (ADR-0008, ADR-0009). Domain terms are in `GLOSSARY.md`.

## Definition of done

`just check` passes (Node 26, from `.nvmrc`); it runs the same gates as CI: the design-token drift check, typecheck, Biome, Vitest and Playwright with axe. Only `apps/web/src/ui` may import `@ui-sdk/*`. The parity fixtures in `packages/engine/fixtures/parity` are frozen; a change that alters one is a change to the engine's behaviour.

## Agent skills

### Issue tracker

GitHub Issues for `scottwmacleod/rollin`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` plus `docs/adr/` at the root. See `docs/agents/domain.md`.

### Implement loop

Repo rules for `/implement`: queue, branch, PR and merge mechanics, limits, and human-stop triggers. See `docs/agents/implement.md`.

### UI skills

Emil Kowalski's UI and animation skills ([emilkowalski/skills](https://github.com/emilkowalski/skills)) live in `.claude/skills/`, with versions in `skills-lock.json`. Use them for UI and motion work. Update them with `npx skills update -p -y`.
