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

#[test]
fn iteration_prefixes_align_when_there_are_ten_or_more() {
    let out = stdout_of(&Cli::new(), 1, &["12x d20 # a, d6"]);
    let lines: Vec<&str> = out.lines().collect();
    assert_eq!(lines.len(), 24);
    assert!(lines[0].starts_with(" 1: d20  "), "{}", lines[0]);
    assert!(lines[1].starts_with(" 1: d6  "), "{}", lines[1]);
    assert!(lines[16].starts_with(" 9: d20  "), "{}", lines[16]);
    assert!(lines[18].starts_with("10: d20  "), "{}", lines[18]);
    assert!(lines[23].starts_with("12: d6  "), "{}", lines[23]);
}

#[test]
fn a_list_repeats_whole_each_item_line_carries_its_iteration() {
    let out = stdout_of(&Cli::new(), 1, &["2x d20+8 # attack, d10+5 # damage"]);
    let lines: Vec<&str> = out.lines().collect();
    assert_eq!(lines.len(), 4);
    for (line, (k, tail)) in lines.iter().zip([
        (1, "# attack"),
        (1, "# damage"),
        (2, "# attack"),
        (2, "# damage"),
    ]) {
        assert!(line.starts_with(&format!("{k}: ")), "{line}");
        assert!(line.ends_with(tail), "{line}");
    }
}

#[test]
fn verbose_puts_an_iteration_header_before_each_repeat() {
    let out = stdout_of(&Cli::new(), 1, &["-v", "2x d20+8 # attack, d10+5"]);
    let headers: Vec<&str> = out.lines().filter(|l| l.starts_with("iteration")).collect();
    assert_eq!(headers, ["iteration 1 of 2", "iteration 2 of 2"]);
    let blocks: Vec<&str> = out
        .lines()
        .filter(|l| l.starts_with("d20+8") || l.starts_with("d10+5"))
        .collect();
    assert_eq!(blocks, ["d20+8  # attack", "d10+5", "d20+8  # attack", "d10+5"]);
    // Each header comes before its own iteration's blocks.
    let first_block = out.find("d20+8").unwrap();
    assert!(out.find("iteration 1 of 2").unwrap() < first_block);
    assert!(first_block < out.find("iteration 2 of 2").unwrap());
}

#[test]
fn verbose_without_repeat_has_no_iteration_header() {
    let out = stdout_of(&Cli::new(), 1, &["-v", "d20+8"]);
    assert!(!out.contains("iteration"), "{out}");
}

#[test]
fn quiet_prints_one_total_per_line_across_repeats_and_lists() {
    let cli = Cli::new();
    let quiet = stdout_of(&cli, 7, &["-q", "3x d20+8, 2d6"]);
    let json = cli.roll_json("3x d20+8, 2d6", 7);
    let expected: String = json["rolls"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| format!("{}\n", r["total"]))
        .collect();
    assert_eq!(quiet.lines().count(), 6);
    assert_eq!(quiet, expected);
}

#[test]
fn a_preset_can_hold_a_repeat_and_labels() {
    let cli = Cli::new();
    cli.run(&["save", "stats", "6x", "4d6dl1"]).assert_success();
    cli.run(&["save", "strike", "d20+8 # attack, d10+5 # damage"])
        .assert_success();
    assert_eq!(
        cli.run(&["presets"]).stdout,
        "stats   6x 4d6dl1\nstrike  d20+8 # attack, d10+5 # damage\n"
    );

    let by_name = cli.run(&["stats", "--seed", "3"]);
    by_name.assert_success();
    let direct = stdout_of(&cli, 3, &["6x 4d6dl1"]);
    assert_eq!(
        by_name.stdout,
        format!("(preset 'stats': 6x 4d6dl1)\n{direct}")
    );
    assert_eq!(by_name.stdout.lines().count(), 7);

    let strike = cli.run(&["strike", "--seed", "3", "--json"]);
    strike.assert_success();
    assert_eq!(strike.json()["rolls"][1]["label"], "damage");
}

#[test]
fn save_rejects_bad_repeats_and_labels_with_a_span_and_saves_nothing() {
    let cli = Cli::new();
    for formula in ["101x d20", "2x 3x d20", "d20 #"] {
        let run = cli.run(&["save", "bad", formula]);
        assert_eq!(run.code, 1, "{formula}: {run:?}");
        assert!(run.stderr.contains('^'), "{formula}: {run:?}");
    }
    assert!(cli.run(&["presets"]).stdout.starts_with("No presets"));
}

#[test]
fn a_lone_repeat_like_word_is_not_mistaken_for_a_preset_lookup() {
    let cli = Cli::new();
    cli.run(&["save", "stats", "6x 4d6dl1"]).assert_success();
    // `6x` alone is a formula error, not an unknown preset.
    let run = cli.run(&["6x"]);
    assert!(run.stderr.contains("nothing to repeat"), "{run:?}");
    // A lone word that is only a typo of a preset still suggests it.
    let typo = cli.run(&["stat"]);
    assert!(typo.stderr.contains("did you mean 'stats'"), "{typo:?}");
}

#[test]
fn the_dice_cap_is_per_roll_not_per_repeat() {
    let six_thousand = "1000d6+1000d6+1000d6+1000d6+1000d6+1000d6";
    let out = stdout_of(&Cli::new(), 1, &["-q", &format!("3x {six_thousand}")]);
    assert_eq!(out.lines().count(), 3);
}

#[test]
fn success_counts_fudge_and_advantage_work_inside_a_repeat_with_labels() {
    let cli = Cli::new();
    let out = cli.roll_json("2x 6d10>=8f1 # pool, 4dF # fate, d20adv+5 # hit", 4);
    let rolls = out["rolls"].as_array().unwrap();
    assert_eq!(rolls.len(), 6);
    assert_eq!(rolls[0]["kind"], "count");
    assert_eq!(rolls[0]["label"], "pool");
    assert_eq!(rolls[1]["expr"]["special"], "fudge");
    assert_eq!(rolls[2]["label"], "hit");
    assert_eq!(rolls[3]["iteration"], 2);
    assert_eq!(rolls[3]["kind"], "count");
    let text = stdout_of(&cli, 4, &["2x 6d10>=8f1 # pool, 4dF # fate"]);
    assert!(text.lines().next().unwrap().starts_with("1: 6d10>=8f1"));
    assert!(text.contains("success"), "{text}");
}
