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

#[test]
fn a_label_with_no_roll_is_an_error_but_empty_items_are_still_ignored() {
    let cli = Cli::new();
    for formula in ["# x", "d20, # x", "d20 # a, # b"] {
        let run = cli.run(&["--seed", "1", "--", formula]);
        assert!(!run.success(), "{formula}: {run:?}");
        assert_eq!(run.stdout, "");
        assert!(
            run.stderr.contains("a label needs a roll"),
            "{formula}: {run:?}"
        );
    }
    let run = cli.run(&["--seed", "1", "d20,,d6 # x,"]);
    run.assert_success();
    assert_eq!(run.stdout.lines().count(), 2);
}
