# One crate with a library core, an injected RNG, and a pinned algorithm

The crate has both a library and a binary target. The library parses and evaluates formulas, takes its random source as a parameter, and returns a structured result tree without printing; the binary owns I/O, arguments, and rendering. A workspace was rejected as overhead until the engine is published separately. The RNG algorithm is pinned (ChaCha8) so `--seed` output is stable and golden-file tests do not rot; changing the algorithm invalidates every golden and must be a deliberate decision.

*Superseded in part by [ADR-0007](0007-tauri-desktop-app-as-workspace-member.md): a workspace is now used for the desktop app, and the library, not the binary, owns non-roll message text and hints (roll rendering and colour stay in the binary). The injected, ChaCha8-pinned RNG stands.*
