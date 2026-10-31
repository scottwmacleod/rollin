# rollin

A dice roller for the command line.

## Status

Version 2 is a rewrite in Rust and is in progress. The original Python
implementation (v1) is preserved at the git tag `v1.0`.

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
