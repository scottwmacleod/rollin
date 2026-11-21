# CI and merging

Recorded on 2026-11-21 from the workflow comments they replace. The workflows call sm-core's shared workflows at a pinned release tag.

**One required check.** `ci` is the only check branch protection requires. It passes when every web-ci job and the budgets job passed. web-ci reads a PR's changed files (hence `pull-requests: read`) to skip jobs a change can't affect, and budgets posts one bundle-size comment per PR (hence `pull-requests: write`).

**Main runs daily.** A PR merged with `GITHUB_TOKEN` starts no workflow on `main`, so `ci` also runs daily on `main`. That run seeds the dependency cache and records `main`'s bundle sizes for the next PR to compare against.

**Auto-merge.** Every PR from this repo's own branches squash-merges once `ci` passes. A PR with the `hold` label never gets auto-merge; that's the implement loop's human stop (`docs/agents/implement.md`). Auto-merge is switched on with the `SM_MERGE_TOKEN` secret, so the merge starts `ci` on `main`. Dependabot PRs go through `dependabot-automerge.yml` instead: minor and patch updates merge once `ci` passes, and majors wait for Scott. Dependabot skips ui-sdk, a beta library kept behind `apps/web/src/ui`, which is upgraded by hand.

**Checks that aren't required.** `bun audit` runs from sm-core but isn't required, because a new advisory could turn an unrelated PR red. A weekly workflow runs plain `tsc --noEmit` beside `bun check`; a red run means `bun check` missed an error, so file it and compare. Another weekly workflow opens one issue when `vendor/sm-core` is behind sm-core's latest release or a pinned agent tool has a newer version, and closes it when current.
