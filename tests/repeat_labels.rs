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

#[test]
fn a_label_runs_to_the_next_comma_and_may_hold_any_other_text() {
    let out = Cli::new().roll_json("d20 #  Fireball: (3d6) ✨ 100%!  ,d6#b", 1);
    let rolls = out["rolls"].as_array().unwrap();
    assert_eq!(rolls.len(), 2);
    assert_eq!(rolls[0]["label"], "Fireball: (3d6) ✨ 100%!");
    assert_eq!(rolls[1]["label"], "b");
    assert_eq!(rolls[1]["formula"], "d6");
}

#[test]
fn a_label_inside_parentheses_swallows_the_close_paren() {
    let run = Cli::new().run(&["(d20 # x)"]);
    assert!(!run.success());
    assert!(run.stderr.contains("unclosed '('"), "{run:?}");
    assert!(run.stderr.contains("label"), "{run:?}");
}

#[test]
fn verbose_shows_the_label_on_the_block_header() {
    let run = Cli::new().run(&["-v", "--seed", "1", "d20+8 # attack"]);
    run.assert_success();
    let first = run.stdout.lines().next().unwrap();
    assert_eq!(first, "d20+8  # attack");
}

#[test]
fn color_dims_the_label_and_plain_output_has_no_escapes() {
    let cli = Cli::new();
    let on = cli.run(&["--color", "always", "--seed", "1", "d20+8 # attack"]);
    assert!(on.stdout.contains("\x1b[2m# attack\x1b[0m"), "{on:?}");
    let off = cli.run(&["--color", "never", "--seed", "1", "d20+8 # attack"]);
    assert!(!off.stdout.contains('\x1b'), "{off:?}");
}
