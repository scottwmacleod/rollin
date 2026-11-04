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
    cargo fmt --check -p rollin-desktop
    just lint
    just tokens-check
    just test

# Desktop app (ADR-0007): needs Node, and webkit packages on Linux. Not part of
# `check`, which stays buildable without them; CI runs the same steps on macOS.
desktop-check:
    cargo fmt --check -p rollin-desktop
    npm --prefix apps/desktop ci
    npm --prefix apps/desktop run build
    cargo clippy -p rollin-desktop --all-targets --locked -- -D warnings
    cargo build -p rollin-desktop --locked

# Run the desktop app in dev mode.
desktop-dev:
    npm --prefix apps/desktop ci
    npm --prefix apps/desktop run tauri -- dev
