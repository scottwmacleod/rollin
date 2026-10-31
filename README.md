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
```

Dropped dice are shown in parentheses and do not count toward the total.
A flat modifier is shown after the dice (`[4, 2] + 3`).

### Formula syntax

Formulas are case-insensitive and spaces are ignored. This is the v1 syntax;
every v1 formula means the same thing here.

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
| `15` | A bare number is its own total |
| `d20+8, d10+5` | Comma-separated list: each item is its own roll on its own line |

Limits (v1): 1 to 1000 dice, 2 to 10000 sides. Dropping or keeping that leaves
no dice is an error. Invalid input prints `error: ...` and exits non-zero.
A bare negative number needs `--` so it is not read as an option:
`rollin -- -5`.

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
| `tests/golden.rs` | Golden fixtures: formula + seed to expected `--json` |
| `tests/v1_spec.rs` | The Python v1 test cases as a parity spec |
| `tests/properties.rs` | `proptest` invariants at the library API |
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

Generate `expected` by running `rollin <formula> --seed <N> --json`, then check
by eye that the values are plausible (within die ranges) before committing. A
failing case is reported by file name.

#### Un-ignoring a v1 spec case

`tests/fixtures/v1_spec.toml` holds the Python v1 tests as data. Cases for
features not built yet have `status = "ignored"` and a `reason` naming the
ticket that owns them. When that ticket's feature works, change the case to
`status = "live"` and delete its `reason` line. Live cases must pass; ignored
cases are skipped and counted (run `cargo test --test v1_spec -- --nocapture`
to see the live/ignored totals).
