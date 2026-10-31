//! Output modes (color, verbose, quiet, JSON) at the CLI seam.

mod common;

use common::Cli;

#[test]
fn json_carries_a_schema_version() {
    let out = Cli::new().roll_json("d20", 1);
    assert_eq!(out["schema_version"], 1);
    assert!(out["rolls"].is_array());
}

fn totals(cli: &Cli, formula: &str, seed: u64) -> Vec<i64> {
    let out = cli.roll_json(formula, seed);
    out["rolls"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["total"].as_i64().unwrap())
        .collect()
}

#[test]
fn quiet_prints_only_the_total() {
    let cli = Cli::new();
    let run = cli.run(&["-q", "2d6+3", "--seed", "4"]);
    run.assert_success();
    let expected = totals(&cli, "2d6+3", 4)[0];
    assert_eq!(run.stdout, format!("{expected}\n"));
    assert_eq!(run.stderr, "");
}

#[test]
fn quiet_prints_one_total_per_line_for_a_comma_list() {
    let cli = Cli::new();
    let run = cli.run(&["--quiet", "d20+8, d10+5", "--seed", "4"]);
    run.assert_success();
    let expected: String = totals(&cli, "d20+8, d10+5", 4)
        .iter()
        .map(|t| format!("{t}\n"))
        .collect();
    assert_eq!(run.stdout, expected);
}

#[test]
fn quiet_error_goes_to_stderr_with_nothing_on_stdout() {
    let run = Cli::new().run(&["-q", "d20+"]);
    assert!(!run.success());
    assert_eq!(run.stdout, "");
    assert!(run.stderr.starts_with("error:"), "{run:?}");
}

#[test]
fn quiet_and_verbose_conflict() {
    let run = Cli::new().run(&["-q", "-v", "d20"]);
    assert!(!run.success());
    assert_eq!(run.stdout, "");
    assert!(run.stderr.contains("cannot be used with"), "{run:?}");
}

#[test]
fn json_wins_over_quiet() {
    let run = Cli::new().run(&["-q", "--json", "d20", "--seed", "1"]);
    run.assert_success();
    assert_eq!(run.json()["schema_version"], 1);
}
