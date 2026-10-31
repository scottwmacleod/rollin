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

/// `rollin --seed <seed> <args...>` stdout, which must succeed.
fn stdout_of(cli: &Cli, seed: u64, args: &[&str]) -> String {
    let seed = seed.to_string();
    let mut all = vec!["--seed", seed.as_str()];
    all.extend_from_slice(args);
    let run = cli.run(&all);
    run.assert_success();
    run.stdout
}

#[test]
fn repeat_rolls_the_formula_n_times_with_numbered_lines() {
    let cli = Cli::new();
    let repeated = stdout_of(&cli, 1, &["3x d20+8"]);
    let plain = stdout_of(&cli, 1, &["d20+8, d20+8, d20+8"]);
    let expected: String = plain
        .lines()
        .enumerate()
        .map(|(i, l)| format!("{}: {l}\n", i + 1))
        .collect();
    assert_eq!(repeated, expected);
}

#[test]
fn json_rolls_carry_the_iteration_only_when_repeated() {
    let cli = Cli::new();
    let out = cli.roll_json("2x d20+8 # attack, d10", 1);
    let rolls = out["rolls"].as_array().unwrap();
    let got: Vec<(i64, bool)> = rolls
        .iter()
        .map(|r| (r["iteration"].as_i64().unwrap(), r.get("label").is_some()))
        .collect();
    assert_eq!(got, [(1, true), (1, false), (2, true), (2, false)]);
    let plain = cli.roll_json("d20+8", 1);
    assert!(plain["rolls"][0].get("iteration").is_none());
}

#[test]
fn the_x_may_be_upper_case_and_spaced_or_not() {
    let cli = Cli::new();
    let expected = stdout_of(&cli, 5, &["3x 4d6dl1"]);
    for formula in ["3 x 4d6dl1", "3X 4d6dl1", "3x4d6dl1", "3xd6+d6", "3 X d6"] {
        let got = stdout_of(&cli, 5, &["--", formula]);
        assert_eq!(got.lines().count(), 3, "{formula}: {got}");
    }
    for formula in ["3 x 4d6dl1", "3X 4d6dl1", "3x4d6dl1", " 3  x  4d6dl1"] {
        assert_eq!(stdout_of(&cli, 5, &["--", formula]), expected, "{formula}");
    }
    // Separate shell words, as in `rollin 3x 4d6dl1`.
    assert_eq!(stdout_of(&cli, 5, &["3x", "4d6dl1"]), expected);
    assert_eq!(stdout_of(&cli, 5, &["3", "x", "4d6dl1"]), expected);
}

#[test]
fn repeat_count_above_the_cap_names_the_cap_and_points_at_it() {
    let cli = Cli::new();
    let run = cli.run(&["101x d20"]);
    assert!(!run.success());
    assert_eq!(run.stdout, "");
    assert!(run.stderr.contains("repeat cap (100)"), "{run:?}");
    assert!(run.stderr.contains("101x"), "{run:?}");
    assert!(run.stderr.contains("\n  101x d20\n  ^^^^\n"), "{run:?}");
    // The cap itself is allowed.
    let ok = stdout_of(&cli, 1, &["-q", "100x d6"]);
    assert_eq!(ok.lines().count(), 100);
}

#[test]
fn repeat_count_of_zero_is_an_error_pointing_at_the_count() {
    let run = Cli::new().run(&["0x d20"]);
    assert!(!run.success());
    assert!(run.stderr.contains("at least 1"), "{run:?}");
    assert!(run.stderr.contains("\n  0x d20\n  ^^\n"), "{run:?}");
}

#[test]
fn a_second_repeat_is_an_error_wherever_it_appears() {
    let cli = Cli::new();
    for (formula, underline) in [
        ("2x 3x d20", "     ^^"),
        ("d20, 3x d6", "       ^^"),
        ("d20 + 3x d6", "        ^^"),
    ] {
        let run = cli.run(&["--", formula]);
        assert!(!run.success(), "{formula}: {run:?}");
        assert_eq!(run.stdout, "");
        assert!(
            run.stderr.contains("only once, at the very start"),
            "{formula}: {run:?}"
        );
        assert!(
            run.stderr
                .contains(&format!("\n  {formula}\n{underline}\n")),
            "{formula}: {run:?}"
        );
    }
}

#[test]
fn a_repeat_with_nothing_after_it_is_an_error() {
    let cli = Cli::new();
    for formula in ["6x", "6 x", "6x ,"] {
        let run = cli.run(&["--", formula]);
        assert!(!run.success(), "{formula}: {run:?}");
        assert_eq!(run.stdout, "");
        assert!(
            run.stderr.contains("nothing to repeat"),
            "{formula}: {run:?}"
        );
    }
}
