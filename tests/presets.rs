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

#[test]
fn listing_with_no_presets_says_so() {
    let run = Cli::new().run(&["presets"]);
    run.assert_success();
    assert_eq!(
        run.stdout,
        "No presets saved. Add one with: rollin save <name> <formula>\n"
    );
}

#[test]
fn saving_an_invalid_formula_shows_the_span_error_and_saves_nothing() {
    let cli = Cli::new();
    let run = cli.run(&["save", "bad", "d20+"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert_eq!(
        run.stderr,
        "error: expected a number, a dice group or '(', found end of input\n  d20+\n      ^\n"
    );
    assert!(run.stdout.is_empty());
    assert!(cli.run(&["presets"]).stdout.starts_with("No presets"));
}

#[test]
fn a_preset_rolls_by_bare_name_with_a_header() {
    let cli = Cli::new();
    cli.run(&["save", "atk", "d20+5"]).assert_success();
    let by_name = cli.run(&["atk", "--seed", "3"]);
    by_name.assert_success();
    let direct = cli.run(&["d20+5", "--seed", "3"]);
    assert_eq!(
        by_name.stdout,
        format!("(preset 'atk': d20+5)\n{}", direct.stdout)
    );
}

#[test]
fn json_and_quiet_output_for_a_preset_have_no_header() {
    let cli = Cli::new();
    cli.run(&["save", "pair", "d20+5, 2d6"]).assert_success();
    let json = cli.run(&["pair", "--seed", "3", "--json"]);
    assert_eq!(json.json()["rolls"].as_array().unwrap().len(), 2);
    let quiet = cli.run(&["pair", "--seed", "3", "-q"]);
    quiet.assert_success();
    assert_eq!(quiet.stdout.lines().count(), 2, "{quiet:?}");
    assert!(!quiet.stdout.contains("preset"));
}

#[test]
fn verbose_output_for_a_preset_keeps_the_header() {
    let cli = Cli::new();
    cli.run(&["save", "atk", "d20+5"]).assert_success();
    let run = cli.run(&["atk", "--seed", "3", "-v"]);
    run.assert_success();
    assert!(run.stdout.starts_with("(preset 'atk': d20+5)\n"), "{run:?}");
}

#[test]
fn roll_command_accepts_a_formula_or_a_preset_name() {
    let cli = Cli::new();
    cli.run(&["save", "atk", "d20+5"]).assert_success();
    let formula = cli.run(&["roll", "2d6", "+", "1", "--seed", "4"]);
    let direct = cli.run(&["2d6 + 1", "--seed", "4"]);
    formula.assert_success();
    assert_eq!(formula.stdout, direct.stdout);
    let preset = cli.run(&["ROLL", "ATK", "--seed", "4"]);
    preset.assert_success();
    assert_eq!(preset.stdout, cli.run(&["atk", "--seed", "4"]).stdout);
}

#[test]
fn an_unknown_lone_word_names_itself_and_suggests_presets() {
    let cli = Cli::new();
    for args in [&["nosuch"][..], &["roll", "nosuch"]] {
        let run = cli.run(args);
        assert_eq!(run.code, 1, "{run:?}");
        assert!(run.stdout.is_empty());
        assert_eq!(
            run.stderr,
            "error: 'nosuch' is not a valid formula or a known preset\nhint: run `rollin presets` to list saved presets\n"
        );
    }
}

#[test]
fn an_unknown_word_close_to_a_preset_suggests_it() {
    let cli = Cli::new();
    cli.run(&["save", "attack", "d20+5"]).assert_success();
    let run = cli.run(&["atack"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert_eq!(
        run.stderr,
        "error: 'atack' is not a valid formula or a known preset\nhint: did you mean 'attack'?\nhint: run `rollin presets` to list saved presets\n"
    );
}

#[test]
fn a_malformed_dice_word_keeps_its_formula_error() {
    let run = Cli::new().run(&["d6dl9"]);
    assert_eq!(run.code, 1);
    assert!(run.stderr.contains("^"), "{run:?}");
    assert!(!run.stderr.contains("known preset"), "{run:?}");
}

#[test]
fn delete_removes_a_preset_case_insensitively() {
    let cli = Cli::new();
    cli.run(&["save", "atk", "d20+5"]).assert_success();
    cli.run(&["save", "keep", "d6"]).assert_success();
    let run = cli.run(&["delete", "ATK"]);
    run.assert_success();
    assert_eq!(run.stdout, "deleted 'atk'\n");
    assert_eq!(cli.run(&["presets"]).stdout, "keep  d6\n");
}

#[test]
fn deleting_a_missing_preset_is_an_error() {
    let run = Cli::new().run(&["delete", "ghost"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert!(run.stdout.is_empty());
    assert_eq!(run.stderr, "error: no preset named 'ghost'\n");
}

#[test]
fn delete_without_a_name_prints_usage() {
    let run = Cli::new().run(&["delete"]);
    assert_eq!(run.code, 1);
    assert_eq!(run.stderr, "error: usage: delete <name>\n");
}

#[test]
fn saving_over_an_existing_preset_says_so() {
    let cli = Cli::new();
    let first = cli.run(&["save", "Atk", "d20+5"]);
    assert_eq!(first.stdout, "saved 'atk': d20+5\n");
    let second = cli.run(&["save", "atk", "d20+7"]);
    second.assert_success();
    assert_eq!(second.stdout, "replaced 'atk' (was d20+5): d20+7\n");
    assert_eq!(cli.run(&["presets"]).stdout, "atk  d20+7\n");
}

#[test]
fn presets_are_listed_sorted_by_name() {
    let cli = Cli::new();
    for (name, formula) in [("zed", "d4"), ("alpha", "d6"), ("mid", "d8")] {
        cli.run(&["save", name, formula]).assert_success();
    }
    assert_eq!(
        cli.run(&["presets"]).stdout,
        "alpha  d6\nmid    d8\nzed    d4\n"
    );
}

#[test]
fn save_without_a_formula_prints_usage() {
    for args in [&["save"][..], &["save", "lonely"]] {
        let run = Cli::new().run(args);
        assert_eq!(run.code, 1);
        assert_eq!(run.stderr, "error: usage: save <name> <formula>\n");
    }
}
