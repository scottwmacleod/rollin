//! Verifies committed fixtures are present and well-formed.
//! (`tests/presets.rs` imports it and rolls every preset.)

use std::collections::BTreeMap;

#[test]
fn presets_json_is_a_nonempty_string_to_string_map() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/presets.json");
    let raw = std::fs::read_to_string(path).expect("presets.json is present");
    let presets: BTreeMap<String, String> =
        serde_json::from_str(&raw).expect("presets.json is a string-to-string map");
    assert!(!presets.is_empty(), "presets.json has no presets");
}
