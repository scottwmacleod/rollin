---
name: delete-comment
description: Audit code comments and clear them out. Use when asked to delete comments, clear the comment baseline, or after no-comments flags a file.
---

# Delete comments

Every comment leaves the code. What it knew goes somewhere better first: a name, a test, an ADR, an issue or the README.

Work in the repo root. The check is `vendor/base/tooling/lint/no-comments.mjs`; run it with `node`, or `bun` in a Bun product. Scope is the whole repo unless the person names a folder.

## Know the fence before you remove it

Do not remove a fence until you know why it was put up. For every comment, find out why it is there before you sort it: read the code around it, `git log -L` or `git blame` the lines, and read the PR or issue that added them. A comment that guards a workaround usually guards a real constraint (a platform bug, a security rule, a decision Scott made). Sort it only once you can say what it protects.

## 1. Inventory

Run the check with `--report` and keep its totals: comment lines, and lines shed. List every comment with its file and line.

Done when every comment is on the list.

## 2. Sort each comment

| Kind | It | Action |
| --- | --- | --- |
| Tautology | repeats what the code, a name, an error message or the README already says | Delete it. If the code is unclear without it, rename or extract until it isn't. |
| Stale | describes code, versions, tags or a state of the world that has moved on | Delete it. If the code it describes is now dead or wrong, file an issue. |
| Excuse | lets a hack or shortcut stand ("for now", "until", "workaround", a rule broken on purpose without a recorded decision) | Delete it and file an issue to fix the hack, with the file, the line and the fence you found. Fix it in the same PR only when it's a one-line change, and say `Closes #N`. |
| Decision record | explains an important, non-obvious choice: why this and not the obvious alternative | Move it into an ADR in `docs/adr/`, then delete it. |

Usage notes (how to call an API, a caller example) go in the README; they are tautologies once there.

Done when each comment has a kind, and the fence behind each excuse and decision record is named.

## 3. Act

- ADRs: one per topic, not one per comment. Number on from the highest in `docs/adr/` (`0004-short-title.md`): a title, then a paragraph on the decision and why, naming the files it covers. Amend an existing ADR when the topic is already there.
- Issues: one per hack, through the repo's issue tracker (`docs/agents/issue-tracker.md`), labelled `needs-triage`.
- Edits: delete the comment and any blank line it leaves. Keep tool directives (`biome-ignore`, `@ts-expect-error`, the `# v7.0.1` beside a pinned action, a shebang).

Then run the repo's own check (`npm run check`, `bun run check` or `just check`) and the no-comments check with `--update`, and commit `comments-baseline.json` with the change.

Done when the checks pass and the baseline is lower.

## 4. Report

In the PR body: comments by kind, each ADR and issue you created, and the lines shed (before and after `--report`). Comments you kept, and why, go in the PR too; the baseline still holds them.
