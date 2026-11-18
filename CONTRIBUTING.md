# Contributing to rollin

Thanks for wanting to help. rollin is a dice roller for tabletop RPGs: a TypeScript dice engine in `packages/engine` and a React web app in `apps/web` (see [ADR-0008](docs/adr/0008-all-typescript-web-first-rebuild.md) and [ADR-0009](docs/adr/0009-retire-the-desktop-app-and-delete-the-rust.md)). Terms such as formula, preset and character are defined in [GLOSSARY.md](GLOSSARY.md).

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). rollin is MIT licensed, and your contributions are released under the same licence.

## Reporting a bug or asking for a feature

- **Bug:** open an issue with the bug report form. Include your browser and the exact formula and steps.
- **Feature:** open an issue with the feature request form and describe the problem you are trying to solve before the solution.
- **Question or half-formed idea:** use [Discussions](https://github.com/scottwmacleod/rollin/discussions).
- **Security problem:** follow [SECURITY.md](SECURITY.md). Don't open a public issue.

New issues get the `needs-triage` label until the maintainer has looked at them. Issues marked `good first issue` or `help wanted` are good places to start.

## Before you write code

For anything beyond a small fix, comment on an issue (or open one) first, so we can agree on the approach before you spend the time. A pull request for something the project doesn't want is a waste of your effort, and we would rather say so early.

Things we will usually say no to:

- A command line tool, a desktop app or native phone apps. rollin is a web app ([ADR-0009](docs/adr/0009-retire-the-desktop-app-and-delete-the-rust.md)).
- Changes to the formula syntax that break existing formulas. The syntax is a superset of v1 ([ADR-0002](docs/adr/0002-formula-syntax-is-a-superset-of-v1.md)).
- Non-integer maths or silently clamped limits ([ADR-0005](docs/adr/0005-integer-only-math.md), [ADR-0006](docs/adr/0006-hard-limits-are-errors.md)).

The decisions behind these are in [`docs/adr/`](docs/adr/).

## Setting up

You need Node 26 (the version in `.nvmrc`). We use [`just`](https://github.com/casey/just) as the task runner, but every recipe is a short list of `npm` commands you can run yourself.

```sh
git clone https://github.com/scottwmacleod/rollin
cd rollin
npm ci
just web-dev    # or: npm --workspace rollin-web run dev
```

## Checks

Before you open a pull request, run:

```sh
just check
```

This runs the same gates as CI: the design-token drift check, typecheck, Biome, the unit and property tests, and the browser tests with axe accessibility checks (`just web-check` is the same thing).

If you changed `ui/tokens.json`, run `just tokens` to regenerate `ui/tokens.css`.

Add or update tests with your change. Fix the cause of a failure rather than skipping or loosening a test.

## Opening a pull request

1. Fork the repository and branch from `main`.
2. Keep the change focused. One pull request should do one thing.
3. Fill in the pull request template and link the issue with `Closes #123`.
4. Tick the kind of change (`enhancement`, `bug` or `internal`). A maintainer applies the label, and the release notes group changes by it.

CI on pull requests from forks needs a maintainer's approval before it runs. That is a security setting, so please be patient. A maintainer reviews each pull request and merges it once the checks pass. We squash-merge, so your branch history doesn't matter, but the pull request title becomes the commit message. Please make it a clear one-line summary.

## Writing style

Write comments, docs and commit messages in plain sentences. The project uses Australian English spelling (for example "colour" and "behaviour"), except in code identifiers.
