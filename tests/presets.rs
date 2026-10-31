//! Global presets and the shared command layer, through the CLI seam.

mod common;

use common::Cli;

#[test]
fn a_saved_preset_is_listed() {
    let cli = Cli::new();
    cli.run(&["save", "attack", "d20+5"]).assert_success();
    let listed = cli.run(&["presets"]);
    listed.assert_success();
    assert_eq!(listed.stdout, "attack  d20+5\n");
}
