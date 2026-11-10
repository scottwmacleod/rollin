# rollin

Dice roller for tabletop RPGs: a Rust CLI, plus a Tauri desktop app in `apps/desktop` (ADR-0007). Domain terms are in `GLOSSARY.md`.

## Definition of done

`just check` passes; it runs the same gates as CI. A change that touches `apps/desktop` also needs `just desktop-check`, which `check` leaves out so it stays buildable without Node.

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
