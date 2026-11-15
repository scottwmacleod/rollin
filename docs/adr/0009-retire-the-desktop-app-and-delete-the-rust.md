# Retire the desktop app and delete the Rust

The Tauri desktop app, the Rust engine and the command-line tool are deleted, and rollin is one TypeScript codebase that runs in the browser at `rollin.scottmacleod.co`. This changes the plan in [ADR-0008](0008-all-typescript-web-first-rebuild.md), which kept the desktop app and wrapped the web app inside it. It was decided on 2026-11-15.

**Why.** The web app reached parity with the desktop app and the Rust engine, and the installable web app covers the reason for wanting an app on the desktop. Wrapping it in Tauri would still cost a signed updater, two operating systems of manual testing and a release pipeline, for an audience of one: at decision time the maintainer was the only user. Keeping the Rust alive as a reference would keep every fresh agent working across two languages, which ADR-0008 set out to end.

**What goes.** The Rust engine and CLI, the Tauri desktop app, the `xtask` design-token generator (replaced by `ui/generate-tokens.mjs`), the release workflow and its auto-update feed, the Rust and desktop CI jobs, and the Rust supply-chain checks (replaced by `npm audit`). Seeded rolls and the ChaCha8 pin go with them. The phone-app loop of ADR-0008 is dropped: the web app is the product, and a wrapper can be reconsidered if that changes.

**What stays.** The parity fixtures, now in `packages/engine/fixtures/parity`. They were recorded from the Rust engine and are frozen; they remain the TypeScript engine's regression suite. ADR-0002, ADR-0003 (the injected die source), ADR-0005 and ADR-0006 still describe the engine.

**Data.** The web app has no TOML import. Anyone with old TOML data converts it to the web app's export file; `docs/export-format.md` documents the file and the README carries a prompt for doing it. The old releases and their git history remain available only as history, and the tag `v1.0` still holds the original Python.

**Hard to reverse.** Rebuilding a desktop shell later is easy; rebuilding the Rust engine is not, and no plan depends on it.
