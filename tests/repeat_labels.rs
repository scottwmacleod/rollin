//! Repeat (`Nx`) and labels (`# text`) at the CLI seam.

mod common;

use common::Cli;

#[test]
fn a_label_is_shown_after_the_roll_line() {
    let run = Cli::new().run(&["d20+8 # attack", "--seed", "1"]);
    run.assert_success();
    assert_eq!(run.stdout, "d20+8  [9] + 8  →  17  # attack\n");
}
