# Local gates; `check` mirrors CI (.github/workflows/ci.yml).

fmt:
    cargo fmt

lint:
    cargo clippy --all-targets -- -D warnings

test:
    cargo test

check:
    cargo fmt --check
    just lint
    just test
