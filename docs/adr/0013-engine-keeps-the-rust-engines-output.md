# The engine keeps the Rust engine's output, spans and arithmetic

The TypeScript engine is a port of the Rust engine ([ADR-0008](0008-all-typescript-web-first-rebuild.md)), and the parity fixtures in `packages/engine/fixtures/parity`, recorded from the Rust engine before it was deleted ([ADR-0009](0009-retire-the-desktop-app-and-delete-the-rust.md)), are frozen. `parity.test.ts` replays each case with its recorded dice and expects the same result, the same dice asked for in the same order, and every draw used. So these choices hold even where JavaScript would make another one easier. Recorded on 2026-11-21 from the code comments they replace.

**Output shape.** The report types in `types.ts` match the Rust engine's JSON, so a fixture compares as plain JSON. A field the engine leaves unset is left out, never set to `undefined`.

**Byte spans.** Error spans are UTF-8 byte offsets, as the Rust engine reported them, while JavaScript strings index UTF-16. `source.ts` holds the formula as UTF-8, and the lexer works in code points, keeping each one's byte offset. A lone surrogate counts as U+FFFD, as `TextEncoder` does. The web app maps a span back to characters before it draws the caret line under the offending text (`caret.ts`). After `@name` is resolved, the number token keeps the span of the `@name`, so an error still points at what the person typed.

**Whitespace.** A typed line splits on Unicode `White_Space`, as Rust's `split_whitespace` does.

**Lexing.** A `p` straight after `!` is the penetrating marker on its own, so `!pkh2` lexes as `!`, `p`, `kh`, `2`. `adv`, `dis` and a repeat's `x` end a run of letters early, so `d20advdl1` lexes as `adv`, `dl`, `1`.

**Keep and drop.** Keeping `n` of a pool drops the rest from the other end. Ties fall by roll order, as in the Rust engine, which a stable sort gives for free.

**Arithmetic.** Integer division truncates toward zero, done in BigInt so it stays exact. Negation is `0 - x` and a product of zero is normalised, so a total is never `-0`.

**Where it differs on purpose.** The Rust engine summed in 64-bit integers. This one keeps every number inside JavaScript's safe integers (2^53 − 1), so it reports "number is too large" or an overflow sooner ([ADR-0005](0005-integer-only-math.md), [ADR-0006](0006-hard-limits-are-errors.md)). `parity.test.ts` lists those cases with what the TypeScript engine says instead.

**Hints are data.** The engine returns hints as data and each front end words them (`apps/web/src/hints.ts`).

**Checking a preset's formula.** Variables aren't known until a preset is rolled, so while a formula is checked for saving, each `@name` stands in as 2, and any error other than a syntax error that touches a variable is ignored, since it may be the stand-in's fault.
