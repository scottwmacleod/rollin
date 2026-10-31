# rollin

A dice roller for the command line.

## Status

Version 2 is a rewrite in Rust and is in progress. The original Python
implementation (v1) is preserved at the git tag `v1.0`.

## Usage

```sh
rollin 4d6dl1              # 4d6dl1  [5, 3, 4, (1)]  →  12
rollin "d20+8, d10+5"      # one line per roll
rollin d20+8, d10+5        # unquoted also works (arguments are joined)
rollin 2d6+3 --seed 7      # reproducible
rollin 2d6+3 --json        # machine-readable, with kept/dropped per die
rollin -q 2d6+3            # just the total
rollin -v 4d6dl1           # full breakdown
```

Dropped dice are shown in parentheses and do not count toward the total.
Each dice group shows its dice, joined by the formula's operators:

```
$ rollin "(d20+5)*2" --seed 3
(d20+5)*2  ([3] + 5) * 2  →  16
$ rollin 2d6+1d4+3 --seed 3
2d6+1d4+3  [1, 4] + [1] + 3  →  9
```

### Formula syntax

Formulas are case-insensitive and spaces are ignored. Every v1 formula means
the same thing here; arithmetic is an addition on top.

| Formula | Meaning |
| --- | --- |
| `d20` | One d20 (`dM` is `1dM`) |
| `2d6` | Two d6s |
| `3d8+5`, `2d6-2` | Dice plus or minus a flat number |
| `4d6dl1` | Drop the lowest 1 |
| `4d6dh1` | Drop the highest 1 |
| `4d6dl`, `4d6dh` | Drop count defaults to 1 |
| `4d6kh3` | Keep the highest 3 |
| `4d6kl2` | Keep the lowest 2 |
| `4d6kh` | Keep count defaults to 1 |
| `2d20kh+8` | Keep clause, then modifier |
| `3d6!` | Exploding: each die showing its maximum rolls another die, which can explode too |
| `3d6!>5`, `d10!>=8`, `3d6!<2`, `3d6!<=2`, `3d6!=4` | Explode on a condition instead of the maximum |
| `3d6!!`, `3d6!!>5` | Compounding: the extra rolls are added into the same die, which shows one combined value |
| `3d6!p`, `3d6!p>5` | Penetrating: like `!`, but each extra die counts one less than it rolled (a 1 counts 0) |
| `4d6!dl1`, `4d6!!kh2` | Explode first, then keep/drop applies to the whole resulting pool |
| `4d6r1`, `4d6r=1` | Reroll any die showing 1, once; the second result stands even if it is also a 1 |
| `4d6r<2`, `4d6r<=2`, `d20r>5`, `d20r>=19` | Reroll once on a comparison (`<`, `<=`, `>`, `>=`, `=`) instead of equals |
| `4d6rr1`, `4d6rr<=2` | Reroll repeatedly until the die no longer matches |
| `4d6r1!dl1` | Order of operations: reroll, then explode, then keep/drop |
| `6d10>=8`, `6d10>7`, `6d10<=3`, `6d10<3`, `6d10=10` | Success count: the roll is how many dice meet the condition, not a sum |
| `6d10>=8f1`, `6d10>=8f<=2`, `6d10>=8 f1` | Failure clause: each counting die matching it (and not a success) subtracts 1 |
| `4d6dl1>=5`, `6d10r1!=10kh4>=8f1` | Order of operations: reroll, explode, keep/drop, then success counting |
| `d20adv`, `d20dis` | Advantage / disadvantage: roll two d20s and keep the highest / lowest; exactly `2d20kh1` / `2d20kl1` |
| `d20adv+8`, `(d20dis+3)*2`, `d20r1adv`, `d10adv>=7` | `adv`/`dis` combine with modifiers: reroll and explode go before it, a success clause after |
| `d%`, `2d%`, `d%dl1` | Percentile: `d%` is a d100, same results as `d100` under the same seed, and takes the same modifiers |
| `4dF`, `4df`, `dF` | Fudge dice: each die is -1, 0 or +1 with equal probability |
| `4dFdl1`, `4dFkh3`, `dFadv` | Keep/drop and `adv`/`dis` work on fudge dice |
| `15` | A bare number is its own total |
| `2d6+1d4+3`, `d20+d4-2` | Add and subtract any dice groups and numbers |
| `d20*2`, `10/4` | Multiply and divide; they bind tighter than `+` and `-` |
| `(d20+5)*2` | Parentheses group |
| `-d6`, `10 + -2` | Unary minus (unary `+` is accepted and ignored) |
| `d20+8, d10+5` | Comma-separated list: each item is its own roll on its own line |

Arithmetic is integer-only. Division truncates toward zero (`7/2` is 3,
`-7/2` is -3), and `*` and `/` are applied left to right (`100/5/2` is 10).
Division by zero and integer overflow are errors, never wrapped values.

Exploding dice stop at 100 explosions per die: a longer chain is an error
naming the cap and the term, not a truncated result. Extra dice count toward
the 10000-dice limit below. A condition that holds for every face (`d6!>=1`,
`d6!<7`, `d6!!<=6`) would explode forever and is rejected before rolling;
one that never holds (`d6!>6`) is allowed and simply never explodes. Keep
and drop counts are checked against the dice written, but apply to every die
in the exploded pool (`4d6!kh2` keeps the two highest of all of them).
A reroll replaces the original die's value; the rerolled-away values stay in
the result (see the output modes) but never count toward the total. A reroll
needs a condition (`4d6r` is an error) and goes straight after the dice,
before any `!` and keep/drop. `rr` stops at 100 rerolls per die: a longer
chain is an error naming the cap and the term. Rerolled dice count toward
the 10000-dice limit below. An `rr` condition that holds for every face
(`d6rr<=6`, `d6rr>=1`, `d6rr<7`) would reroll forever and is rejected before
rolling; plain `r` with such a condition is allowed (it just rerolls every
die once), and a condition that never holds (`d6rr>6`) is allowed and does
nothing. Keep and drop counts are checked against the dice written
(`4d6r1dl4` is an error), and apply to the dice that stand, not to
rerolled-away values.
A success clause goes last on the dice group, after reroll, explode and
keep/drop: it is a comparison operator (`>=`, `>`, `<=`, `<`, `=`) and a
number. A bare number is not a success clause (`6d10=10`, not `6d10 10`). The
optional failure clause `f` must come straight after it and takes a bare
number (equals) or a comparison, like a reroll condition. Only dice that
count are scored: dropped and rerolled-away dice are not, exploded extra dice
are, and a compounded or penetrating die is scored by its counted value.
The result is a success count: successes minus failures, so it can be zero
or negative. A die that matches both clauses is a success (success wins),
so `d6>=5f>=3` fails only on a 3 or 4. Always-true and never-true
conditions are legal (`5d6>=1` is always 5).
A `!` takes the comparison right after it as its own explode condition, so
`8d10!>=8` is an exploding d10 that sums (it explodes on 8 or more) and is
not a success count; put the success clause after an explicit explode
condition: `8d10!>=8>=8`, `4d6!>5>=6`, or `4d6!=6>=5`. The same goes for
a reroll (`6d10r<2>=8`).
A success count is a different kind of result from a sum, so it cannot be
mixed into arithmetic: `6d10>=8 + 3`, `3 + 6d10>=8`, `-6d10>=8`,
`2*6d10>=8`, `(6d10>=8)+1` and two counts added are errors. A whole roll
may be parenthesised, `(6d10>=8)`, and counts and sums can sit side by side
in a comma list: `6d10>=8, d20`.
`adv` and `dis` are suffixes on a dice group written with exactly one die
(`d20adv` or `1d20adv`; `2d20adv` is an error; write `3d20kh1` and the like yourself). They take the keep/drop slot, so combining them with `dl`, `dh`,
`kl` or `kh` in either order (`d20advdl1`, `3d20kh1adv`) is an error. The
output shows both dice with the loser dropped, as in `2d20kh1`; the formula
is echoed as typed, and `d20adv` counts as two dice toward the dice limits.
A natural 20 or 1 is highlighted only on a lone single-die roll, so `d20adv`
is never highlighted.
`d%` is a d100 whose faces and RNG use are identical to `d100`; the formula
and term are echoed as typed (`d%`), and `--json` marks the group with
`"special": "percentile"` and `"sides": 100`.
Fudge dice (`dF`, any letter case) draw a single uniform choice among three
outcomes per die, exactly the same draw as a d3 shifted by two (face 1 is -1,
2 is 0, 3 is +1). Default output shows each fudge die as `+`, `0` or `-`
(the symbols printed on real fudge dice, readable at a glance, and distinct
from numbers so a die's sign is never lost); `-v` shows the numeric value
(`-1 kept`) and `--json` has the numbers -1, 0 and 1, with
`"special": "fudge"` and `"sides": 3` on the group. The total is always
numeric (`4dF` totals -4 to 4). Fudge dice count toward the dice limits and
skip the sides check. Reroll (`r`, `rr`), explode (`!`) and success clauses
are not supported on fudge dice and are errors pointing at the clause
(`4dF!`, `4dFr1`, `4dF>=1`: "... clauses are not supported on fudge dice").
Quote formulas containing `!` in an interactive shell (`rollin '3d6!'`), where
`!` can trigger history expansion.

Limits: 1 to 1000 dice per term, 2 to 10000 sides, 10000 dice rolled per
roll (one comma-separated item, explosion dice included), and nesting (parentheses and unary minus)
32 deep. Dropping or keeping that leaves no dice is an error.
A bare negative number needs `--` so it is not read as an option:
`rollin -- -5`.

### Errors

An invalid formula prints the problem on stderr, repeats the formula with
carets under the offending part, and exits non-zero (nothing is printed on
stdout):

```
$ rollin "d20+"
error: expected a number, a dice group or '(', found end of input
  d20+
      ^
$ rollin "d20 / (3-3)"
error: division by zero
  d20 / (3-3)
        ^^^^^
$ rollin "6d10>=8 + 3"
error: a success count cannot be used in arithmetic; use it as a whole roll, or drop the success clause to sum the dice
  6d10>=8 + 3
  ^^^^^^^
$ rollin "2d6+1001d6"
error: dice per term cap (1000) exceeded by '1001d6'
  2d6+1001d6
      ^^^^
```

Exceeding a cap names the cap and the term. Other errors: `unclosed '('`,
`arithmetic overflow`, `sides must be between 2 and 10000`, and so on.

### Output modes

By default each roll prints on one line, as above. Flags change the renderer;
all of them draw from the same result tree.

**Color.** On a terminal, dropped dice are dimmed, totals are bold, and when
the whole roll is a single d20 (`d20`, `d20+5`, `1d20-2`) a natural 20 is
bold green and a natural 1 bold red. Color is off when stdout is not a
terminal (for example piped) or when `NO_COLOR` is set to a non-empty value.
`--color <auto|always|never>` overrides it; the default is `auto`. Precedence:
`--color never` beats `--color always`, which beats `NO_COLOR`, which beats
terminal detection. Errors on stderr are always plain.

**Verbose (`-v`, `--verbose`).** One block per roll (blank line between
blocks) listing every die with its status, each term's subtotal, the
operators, and the total. Nested expressions are indented and bracketed:

```
$ rollin -v 4d6dl1 --seed 3
4d6dl1
  4d6dl1: 1 dropped, 4 kept, 1 kept, 6 kept = 11
  total: 11
$ rollin -v "(d20+5)*2" --seed 3
(d20+5)*2
  (
    d20: 3 kept = 3
    + 5
  ) = 8
  * 2
  total: 16
```

Exploded dice are marked with a trailing `!` in the default output and the
word `exploded` in `-v`; a compounded die is one entry marked `!` whose
`-v` line shows the rolls it combined:

```
$ rollin --seed 2 3d6!
3d6!  [2, 6, 4!, 4]  →  16
$ rollin --seed 2 3d6!!
3d6!!  [2, 10!, 4]  →  16
$ rollin -v --seed 2 3d6!!
3d6!!
  3d6!!: 2 kept, 10 kept (6+4), 4 kept = 16
  total: 16
$ rollin -v --seed 2 3d6!p
3d6!p
  3d6!p: 2 kept, 6 kept, 3 exploded, 4 kept = 15
  total: 15
```

Dice a reroll replaced are shown between tildes (`~1~`) in the default
output, with the die that replaced them right after, and as `rerolled` in
`-v`. With color on they are dim and crossed out (dropped dice are dim only):

```
$ rollin --seed 3 4d6r1
4d6r1  [~1~, 4, ~1~, 6, ~1~, 5, 4]  →  19
$ rollin --seed 8 4d6rr1
4d6rr1  [2, ~1~, ~1~, 5, 5, 6]  →  18
$ rollin -v --seed 3 4d6r<2dl1
4d6r<2dl1
  4d6r<2dl1: 1 rerolled, 4 dropped, 1 rerolled, 6 kept, 1 rerolled, 5 kept, 4 kept = 15
  total: 15
```

Fudge dice read `+`, `0` and `-` in the one-line output (`4dF  [-, -, +, +]  →  0`) and as numbers in `-v`.
Success counts show each counting die's outcome after its value, `✓` for a
success and `✗` for a failure, and label the total as a count so it cannot
be mistaken for a sum: `3 successes`, `1 success`. When any die failed, the net
is followed by the breakdown, `2 successes (3 - 1 failure)`. With color on,
successes are green and failures red. `-v` adds the words `success` and
`failure` to the dice and a tally line; `-q` prints just the net number.

```
$ rollin --seed 6 6d10>=8
6d10>=8  [4, 5, 6, 4, 4, 1]  →  0 successes
$ rollin --seed 2 6d10>=8f1
6d10>=8f1  [6, 6, 1✗, 3, 9✓, 3]  →  0 successes (1 - 1 failure)
$ rollin -v --seed 2 6d10>=8f1
6d10>=8f1
  6d10>=8f1: 6 kept, 6 kept, 1 kept failure, 3 kept, 9 kept success, 3 kept = 0
    successes: 1, failures: 1, net: 0
  total: 0 successes (1 - 1 failure)
```

**Quiet (`-q`, `--quiet`).** Only the total of each roll, one per line, so
`$(rollin -q 2d6+3)` works in scripts. Errors still go to stderr with a
non-zero exit and nothing on stdout.

```
$ rollin -q "d20+8, d10+5" --seed 1
17
8
```

**JSON (`--json`).** The result tree as one line of JSON with a
`schema_version`; see [docs/json-schema.md](docs/json-schema.md) for the
schema and an example of every node type. `--json` wins over `-q` and `-v`
(they are ignored). `-q` and `-v` together are an error.

## Development

Requires a stable Rust toolchain (see `rust-toolchain.toml`).

```sh
cargo test
cargo fmt
cargo clippy --all-targets -- -D warnings
```

### Tests

Behaviour tests go through the CLI seam: the compiled `rollin` binary is run
as a process with `--seed`, `--json`, and a fresh temporary `XDG_CONFIG_HOME`
per test. The helper is `tests/common/mod.rs` (`Cli::new()`, `cli.run(&[..])`).

| Test file | What it covers |
| --- | --- |
| `tests/roll.rs` | End-to-end rolls, e.g. `rollin d20 --seed 1` |
| `tests/arithmetic.rs` | `+ - * /`, precedence, parentheses, result tree |
| `tests/errors.rs` | Error text with underlined spans, caps, overflow |
| `tests/output_modes.rs` | Color, `-v`, `-q` and `--json` flag behaviour |
| `tests/golden.rs` | Golden fixtures (the `--json` contract): formula + seed to expected output |
| `tests/v1_spec.rs` | The Python v1 test cases as a parity spec |
| `tests/properties.rs` | `proptest` invariants at the library API, including "never panics" |
| `tests/fixtures_present.rs` | Committed fixtures (`presets.json`) are well-formed |

Run everything with `cargo test`. The CI jobs are `lint` (`cargo fmt --check`,
clippy with `-D warnings`) and `test` (`cargo test`).

#### Seeds and the pinned RNG

`--seed <N>` seeds a `rand_chacha::ChaCha8Rng` via `seed_from_u64`, so the same
seed and formula always print the same roll. Without `--seed`, the RNG is
seeded from OS entropy. The algorithm is pinned to ChaCha8 on purpose: changing
it (or the way dice are drawn) changes seeded output and invalidates every
golden fixture, so treat it as a deliberate decision.

#### Adding a golden case (data only)

Add a file `tests/fixtures/golden/<name>.json`; no Rust changes are needed:

```json
{ "formula": "2d6", "seed": 7, "expected": { "rolls": [ ... ] } }
```

Generate `expected` by running `rollin --seed <N> --json -- <formula>`, then check
by eye that the values are plausible (within die ranges) before committing. A
failing case is reported by file name.

#### Un-ignoring a v1 spec case

`tests/fixtures/v1_spec.toml` holds the Python v1 tests as data. Cases for
features not built yet have `status = "ignored"` and a `reason` naming the
ticket that owns them. When that ticket's feature works, change the case to
`status = "live"` and delete its `reason` line. Live cases must pass; ignored
cases are skipped and counted (run `cargo test --test v1_spec -- --nocapture`
to see the live/ignored totals).
