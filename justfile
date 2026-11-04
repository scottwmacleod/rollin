# Local gates; `check` mirrors CI (.github/workflows/ci.yml).

fmt:
    cargo fmt

lint:
    cargo clippy --all-targets -- -D warnings

test:
    cargo test

# Regenerate ui/tokens.css from ui/tokens.json.
tokens:
    cargo run --quiet --package xtask -- tokens

# Fail if ui/tokens.css has drifted from ui/tokens.json.
tokens-check:
    cargo run --quiet --package xtask -- tokens --check

check:
    cargo fmt --check
    just lint
    just tokens-check
    just test
