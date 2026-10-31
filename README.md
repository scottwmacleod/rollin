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
