# Implement loop

Repo-specific rules for `/implement`. The global `/implement` skill stays generic; where this file is more specific, this file wins. It overrides the global "commit to the current branch" with one branch and one PR per issue.

The loop runs unattended. A human is interrupted only when a rule below says so.

## Queue

- With no argument, work the open issues labelled `ready-for-agent`, lowest number first. Label meanings are in `triage-labels.md`.
- `/implement #n` runs only that issue and ignores the queue.
- Skip an issue while any blocker is open. Read blockers from the `Blocked by:` line in the issue body (`gh issue view <n>`) and check each referenced issue's state; the native dependency edge (see `issue-tracker.md`) mirrors it for the GitHub UI but is not needed here.
- After every merge, re-query the queue from scratch so newly unblocked issues are picked up. Stop when nothing unblocked is left. Never invent work.
- If an issue's acceptance criteria are missing or not testable, swap `ready-for-agent` for `needs-info`, comment what is missing, and move on.

## Touches

Each issue may carry one line in its body: `**Touches:** ` followed by comma-separated backticked paths or globs, e.g. ``**Touches:** `src/command/**`, `tests/command_*` ``. This is the only definition of the format.

- Run at most 3 issues at once, and only if their `Touches:` globs are pairwise disjoint.
- An issue with no `Touches:` line runs alone.
- After a builder finishes, compare `git diff --name-only origin/main...HEAD` with the declared globs. If it strays into another running issue's paths, pause the later issue until the earlier one merges, then rebase it.

## Per issue

1. **Branch.** `agent/<n>-<slug>` from fresh `origin/main`, in its own checkout. In T3, start builders with `delegate_task` (call `orchestrator_capabilities` once per thread first), which gives each its own checkout; do not run `git worktree add` there. Outside T3, use the `Agent` tool with `isolation: "worktree"`.
2. **Build.** Builder subagent (model `sonnet`) implements with `/tdd`, runs single tests as it goes, commits on the branch. It never opens a PR and never touches the issue labels.
3. **Verify (main thread, independent).** The main thread itself runs these and reads the output; a builder saying "tests pass" is not evidence:
   - `cargo fmt --check`
   - `cargo clippy --all-targets -- -D warnings`
   - `cargo test`
   - then reads the diff against every acceptance criterion. If anything fails or is missing, spawn a fix subagent (`sonnet`) and verify again.
4. **Review.** Reviewer subagent (model `opus`) runs `/code-review` on the branch and returns findings only; it never edits.
   - **Clear** means no correctness, standards or spec findings. Nits do not block; ignore them, or file `needs-triage` issues if they matter.
   - Blocking findings go to fix subagents (`sonnet`), then back to step 3. Maximum 3 review rounds.
5. **Stop check.** Run the human-stop triggers below against the diff.
6. **PR.** PR subagent (model `haiku`) pushes the branch, opens the PR with `Closes #n`, and unless step 5 tripped runs `gh pr merge --auto --squash --delete-branch`. It returns the PR URL and does not wait.
7. **Wait.** The main thread waits for CI, not the subagent. In T3 call `link_pull_request` on the new PR, then `watch_pull_request`, and end the turn; call `unwatch_pull_request` once the PR is merged or abandoned. Outside T3 poll `gh pr view <n> --json state,statusCheckRollup`. Do not use `sleep` loops or `gh pr checks --watch` where the harness forbids waiting.
8. **Resolve.**
   - `MERGED`: `git fetch origin` (every branch is cut from `origin/main`, so local `main` is never needed), then go back to the queue.
   - Branch behind `main`: (strict protection; merge queue is unavailable on user-owned repos) `gh pr update-branch`, wait again, auto-merge stays enabled.
   - Infrastructure failure (runner error, network): `gh run rerun --failed`, at most 2 times.
   - Real failure: read the logs, spawn a fix subagent (`sonnet`), push, verify (step 3) again. Maximum 3 attempts. The last attempt uses `opus`.

## Giving up

When a limit is hit (3 review rounds, 3 CI fix attempts, or an unresolvable conflict): replace `ready-for-agent` with `ready-for-human`, comment with what was tried and where it stuck, close the PR, keep the branch, and continue with the next issue. One stuck issue never halts the run. Issues it blocks stay blocked and go in the report.

## Human-stop triggers

Checked by the main thread against the PR diff. If any fires: open the PR but do **not** enable auto-merge, replace `ready-for-agent` with `ready-for-human`, comment why, and continue with other issues. Dependents stay blocked until a human merges.

- Renames or removes the `lint`, `test`, `test-linux`, `desktop` or `ci` jobs in `.github/workflows/ci.yml`, or changes what `ci` needs (`ci` is the aggregate required check; the others feed it).
- Adds or edits anything that publishes or releases: a release workflow, `cargo publish`, tokens, `secrets.*`, `cargo-dist` or `release-plz` config.
- Uses `pull_request_target` or `workflow_run`, or widens workflow `permissions:` beyond `contents: read`.
- Edits this file or `.claude/settings.json` (the loop's own rules).

## Models

Pass these as the `Agent` tool's `model` value: main thread `opus` (start the session on Opus), reviewer `opus`, builder and fix subagents `sonnet`, PR subagent `haiku`, last CI fix attempt `opus`.

## Prerequisites

The loop never installs tools. If a ticket needs one that is missing (`just`, `cargo-deny`, ...), swap `ready-for-agent` for `needs-info`, comment which tool, and move on. Tools currently expected: `just` and `cargo-deny` (`brew install just cargo-deny`).

## Permissions

`.claude/settings.json` holds the allowlist and denylist so the loop does not prompt. The denylist is best-effort pattern matching, not enforcement: the real guard for `main` is branch protection. Any command not on the allowlist will prompt and stall an unattended run, so add it there before relying on it in this file.

## Final report

When the queue is exhausted, report in this order: PRs stopped by a human-stop trigger, stuck issues (`ready-for-human`), still-blocked issues, merged PRs.
