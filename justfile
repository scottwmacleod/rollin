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

# Regenerate the desktop's TypeScript wire types from the Rust types. `check`
# fails (via the `wire` test) while they are out of date; no Node needed.
types:
    cargo run --quiet -p rollin-desktop-core --example wire_types > apps/desktop/src/api/generated.ts

# Desktop app (ADR-0007): needs Node, and webkit packages on Linux. Not part of
# `check`, which stays buildable without them; CI runs the same steps on macOS.
desktop-check:
    cargo fmt --check -p rollin-desktop
    cargo test -p rollin-desktop-core --test wire
    npm --prefix apps/desktop ci
    npm --prefix apps/desktop run build
    cargo clippy -p rollin-desktop --all-targets --locked -- -D warnings
    cargo build -p rollin-desktop --locked

# Run the desktop app in dev mode.
desktop-dev:
    npm --prefix apps/desktop ci
    npm --prefix apps/desktop run tauri -- dev
