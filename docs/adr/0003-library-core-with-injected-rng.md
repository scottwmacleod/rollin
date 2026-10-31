# One crate with a library core, an injected RNG, and a pinned algorithm

The crate has both a library and a binary target. The library parses and evaluates formulas, takes its random source as a parameter, and returns a structured result tree without printing; the binary owns I/O, arguments, and rendering. A workspace was rejected as overhead until the engine is published separately. The RNG algorithm is pinned (ChaCha8) so `--seed` output is stable and golden-file tests do not rot; changing the algorithm invalidates every golden and must be a deliberate decision.
