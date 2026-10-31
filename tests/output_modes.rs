//! Output modes (color, verbose, quiet, JSON) at the CLI seam.

mod common;

use common::Cli;

#[test]
fn json_carries_a_schema_version() {
    let out = Cli::new().roll_json("d20", 1);
    assert_eq!(out["schema_version"], 1);
    assert!(out["rolls"].is_array());
}
