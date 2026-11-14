# Rebuild rollin as one TypeScript codebase, web first

rollin moves from a Rust library plus a Tauri bridge plus a hand-built DOM front end to a single TypeScript codebase that runs in the browser. The decision was agreed on 2026-11-15 and is specified in [#216](https://github.com/scottwmacleod/rollin/issues/216); the full plan and decision log are at <https://claude.ai/artifact/GJdLPCLBGdHeDqxfBw4iwE>.

**Why.** The product is architected by someone who does not read code, so every change depends on agents working fluently across three layers: the Rust engine, generated wire types, and a bespoke front end. One language, one test runner and one lint tool make the next change cheaper for any fresh agent. A web app also reaches phones and shared links, which the desktop app cannot.

**What changes.**

- The dice engine, game systems, characters and presets are ported from Rust to a TypeScript engine package with no UI and no browser APIs. It keeps one public entry: roll a formula against an optional character, presets and an injected die source. ADR-0002 (formula syntax), ADR-0003 (injected randomness), ADR-0005 (integer-only maths) and ADR-0006 (hard limits are errors) carry over. In production the die source is `crypto.getRandomValues`; ChaCha8 and seeded rolls are not reimplemented.
- The app is React with Vite, strict TypeScript and Tailwind, with components from ui-sdk pinned to an exact version and imported only through the app's own thin component layer. The two packages live in this repository as npm workspaces.
- Everything runs in the player's browser, with no app server. Characters, variables, presets, settings and the roll log live behind one `Storage` interface, implemented on IndexedDB. A later sync backend can slot in behind the same interface. Export and import use a single versioned JSON file. The only data that leaves the browser is Vercel's cookieless page counts.
- Hosting is Vercel at `rollin.scottmacleod.co`, with a preview per pull request and production on merge to `main`.
- Proof of the port: the Rust engine exports parity fixtures (formula, context, die faces in draw order, expected result tree). The TypeScript engine replays the faces and must produce the same tree. The fixtures run in CI until the Rust is deleted, then stay as the engine's regression suite.

**Build loops.** The work ships in ten loops, each ending with a production deploy: foundations; first roll; roll log; the full dice language; presets and export/import; characters and 5e; palette and polish; phone-ready web; the desktop swap; phone apps.

**Desktop swap.** The Tauri desktop app keeps shipping, fixes only, until the web app matches it. Then it loads the web app and the TypeScript engine, imports existing TOML data once on first launch, and auto-update carries existing users across. The Rust engine and the CLI are deleted at that point.

**Effect on earlier decisions.** [ADR-0001](0001-rewrite-in-rust-in-place.md) (rewrite in Rust) and [ADR-0004](0004-toml-data-in-config-dir.md) (TOML in the config dir) will be superseded when the desktop swap lands; until then they describe the code that ships. [ADR-0007](0007-tauri-desktop-app-as-workspace-member.md) is amended: the Tauri app stays a workspace member only until the swap, and afterwards it wraps the web app.

**Out of scope for this decision.** Accounts and sync, any app server, seeded rolls for players, game systems other than D&D 5e, and code signing.
