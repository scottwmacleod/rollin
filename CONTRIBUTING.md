# Contributing to rollin

Thanks for wanting to help. rollin is a dice roller for tabletop RPGs: a Rust library and command line tool at the repository root, and a Tauri desktop app in `apps/desktop` (see [ADR-0007](docs/adr/0007-tauri-desktop-app-as-workspace-member.md)). Terms such as formula, preset and character are defined in [GLOSSARY.md](GLOSSARY.md).

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). rollin is MIT licensed, and your contributions are released under the same licence.

## Reporting a bug or asking for a feature

- **Bug:** open an issue with the bug report form. Include the version, your operating system, and the exact formula and steps.
- **Feature:** open an issue with the feature request form and describe the problem you are trying to solve before the solution.
- **Question or half-formed idea:** use [Discussions](https://github.com/scottwmacleod/rollin/discussions).
- **Security problem:** follow [SECURITY.md](SECURITY.md). Don't open a public issue.

New issues get the `needs-triage` label until the maintainer has looked at them. Issues marked `good first issue` or `help wanted` are good places to start.

## Before you write code

For anything beyond a small fix, comment on an issue (or open one) first, so we can agree on the approach before you spend the time. A pull request for something the project doesn't want is a waste of your effort, and we would rather say so early.

Things we will usually say no to:

- A published command line release. The CLI is built from source only, and there is no plan to package it.
- Changes to the formula syntax that break existing formulas. The syntax is a superset of v1 ([ADR-0002](docs/adr/0002-formula-syntax-is-a-superset-of-v1.md)).
- Non-integer maths or silently clamped limits ([ADR-0005](docs/adr/0005-integer-only-math.md), [ADR-0006](docs/adr/0006-hard-limits-are-errors.md)).

The decisions behind these are in [`docs/adr/`](docs/adr/).

## Setting up

You need the Rust toolchain from [rustup](https://rustup.rs). `rust-toolchain.toml` pins the channel and components. We use [`just`](https://github.com/casey/just) as the task runner.

```sh
git clone https://github.com/scottwmacleod/rollin
cd rollin
cargo build            # the library and CLI
cargo run -- 4d6dl1    # try it
```

The desktop app also needs Node and, on Linux, the WebKit packages that Tauri lists. To run it in development mode:

```sh
just desktop-dev
```

## Checks

Before you open a pull request, run:

```sh
just check
```

This runs the same gates as CI: formatting, Clippy with warnings as errors, a design-token drift check and the test suite. If you touched `apps/desktop`, also run:

```sh
just desktop-check
```

If you changed a Rust type the desktop app shares, regenerate the TypeScript types with `just types`. If you changed `ui/tokens.json`, run `just tokens`.

Add or update tests with your change. Fix the cause of a failure rather than skipping or loosening a test.

## Opening a pull request

1. Fork the repository and branch from `main`.
2. Keep the change focused. One pull request should do one thing.
3. Fill in the pull request template and link the issue with `Closes #123`.
4. Tick the kind of change (`enhancement`, `bug` or `internal`). A maintainer applies the label, and the release notes group changes by it.

CI on pull requests from forks needs a maintainer's approval before it runs. That is a security setting, so please be patient. A maintainer reviews each pull request and merges it once the checks pass. We squash-merge, so your branch history doesn't matter, but the pull request title becomes the commit message. Please make it a clear one-line summary.

## Writing style

Write comments, docs and commit messages in plain sentences. The project uses Australian English spelling (for example "colour" and "behaviour"), except in code identifiers.
