//! Repeat (`Nx`) and labels (`# text`) at the CLI seam.

mod common;

use common::Cli;

#[test]
fn a_label_is_shown_after_the_roll_line() {
    let run = Cli::new().run(&["d20+8 # attack", "--seed", "1"]);
    run.assert_success();
    assert_eq!(run.stdout, "d20+8  [9] + 8  →  17  # attack\n");
}

#[test]
fn json_rolls_carry_the_label_only_when_labelled() {
    let out = Cli::new().roll_json("d20+8 # attack, d10+5", 1);
    let rolls = out["rolls"].as_array().unwrap();
    assert_eq!(rolls[0]["label"], "attack");
    assert_eq!(rolls[0]["formula"], "d20+8");
    assert!(rolls[1].get("label").is_none(), "{rolls:?}");
    assert_eq!(out["schema_version"], 1);
}

#[test]
fn an_empty_label_is_an_error_pointing_at_the_hash() {
    let run = Cli::new().run(&["d20 #  "]);
    assert!(!run.success());
    assert_eq!(run.stdout, "");
    assert!(run.stderr.contains("label"), "{run:?}");
    // The caret sits under the '#'.
    assert!(run.stderr.contains("\n  d20 #  \n      ^\n"), "{run:?}");
}
