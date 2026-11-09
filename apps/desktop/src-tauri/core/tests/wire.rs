//! The generated TypeScript is checked in and must match the Rust types.

use rollin_desktop_core::wire;

#[test]
fn the_checked_in_types_match_the_rust_types() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../src/api/generated.ts");
    let checked_in = std::fs::read_to_string(path)
        .unwrap_or_default()
        .replace("\r\n", "\n");
    assert!(
        checked_in == wire::typescript(),
        "apps/desktop/src/api/generated.ts is out of date with the Rust types; run `just types`"
    );
}
