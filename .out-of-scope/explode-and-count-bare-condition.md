# Explode-and-count from a bare `!cmp`

`6d10!>=8` stays an exploding sum. It will not be read as "explode and count successes". To explode and count, write the success clause explicitly after the explode condition: `6d10!>=8>=8`.

## Why this is out of scope

After `!`, `!!` or `!p`, `parse_explode` (`src/parser.rs`) reads any comparison as the explode condition. The success clause is parsed afterwards, so it needs its own comparison. Making a trailing `!cmp` double as a success clause would collide with a documented, valid form:

- `d10!>=8` is listed in the README formula table as "explode on 8+" and returns a sum. Reinterpreting `!cmp` as explode-and-count would silently change its result.
- There is no way to tell "explode on 8+, sum" from "explode on 8+, count 8+" by looking at the formula alone. Telling them apart needs new syntax, which is a separate design question (and ADR 0002 says new syntax must be a suffix or prefix that doesn't redefine existing tokens).

An error or hint on a trailing `!cmp` was also rejected. That form is valid and intended, so it can't be an error. A hint would fire on correct input, and the CLI only emits hints on error paths (`Error::hint`), so it would mean building a warning channel for successful rolls to paper over a documentation gap that the README already fills.

The current behaviour is documented in the README (formula table and the paragraph beginning "A `!` takes the comparison right after it") and pinned by `tests/success_counting.rs`.

## Prior requests

- #45 — "Decide: should `6d10!>=8` explode-and-count?"
