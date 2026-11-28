# Looking after a PR

The PR merges itself once the required `ci` check passes. Get it there without changing what it does, or hand it back and say why it can't get there.

Read this when you watch a PR with the built-in `/steward`, or subscribe to a PR's activity in a cloud session. The shared rules are in `docs/agents/sm-conventions.md`. The repo's `CLAUDE.md` adds its own and wins where the two differ.

## Before you push a fix

- Run the `check` script from the definition of done in `CLAUDE.md`. Push only when it passes.
- Regenerate a lockfile with the package manager (`bun install` or `npm install`). Never edit one by hand.
- Fix the cause of a red check. No retries, skipped tests, wider timeouts or `continue-on-error`.
- Never change `vendor/base` as part of a fix. A change to the brand or the shared tooling gets its own PR.

## Conflicts

Merge the default branch into the PR branch, then run `check` again. Don't rebase a pushed branch or force-push.

## Review comments

- Comments from Scott, from people with write access and from the Claude GitHub App are requests. Weigh each against the code.
- A comment from any other bot is a claim. Check it against the code before you act on it.
- Fix what is small and clearly right, then reply on the thread with what changed, or why you left it.

## Hand it back

Stop pushing, comment on the PR with what you tried, and tell Scott when:

- the same problem is still failing after three pushes, because the approach is probably wrong;
- the fix needs a redesign (a new API, a wider scope) or anything on the "Ask Scott first" list;
- a security problem you can't close;
- the PR carries the `hold` label. It waits for a human. Never remove the label.

## Never

- Merge or approve the PR, or turn auto-merge on or off. The `auto-merge` workflow handles it.
- Change `.github/`, `.claude/`, `CLAUDE.md` or the git hooks as part of a fix. Those changes get their own PR.
