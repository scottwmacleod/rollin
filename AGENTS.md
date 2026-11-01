# rollin

Command-line dice roller for tabletop RPGs. v1 is Python; v2 is a planned Rust rewrite.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for scottwmacleod/rollin, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Implement loop

Repo rules for `/implement`: queue, branch/PR/merge mechanics, limits, and human-stop triggers. See `docs/agents/implement.md`.

## Commands

- `just fmt`: format the code with `cargo fmt`.
- `just lint`: run clippy as CI does (`cargo clippy --all-targets -- -D warnings`).
- `just test`: run the full test suite with `cargo test`.
- `just check`: run `cargo fmt --check`, then `just lint`, then `just test`; the same gates as CI.

## Definition of done

Work is done when `just check` passes.
