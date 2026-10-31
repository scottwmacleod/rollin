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
