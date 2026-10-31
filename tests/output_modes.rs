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

const DIM: &str = "\x1b[2m";
const BOLD: &str = "\x1b[1m";
const RESET: &str = "\x1b[0m";
const NAT20: &str = "\x1b[1;32m";
const NAT1: &str = "\x1b[1;31m";
/// Seeds under which the first d20 rolls a natural 1 / 20.
const SEED_NAT1: &str = "27";
const SEED_NAT20: &str = "39";

fn color_run(args: &[&str]) -> common::Run {
    let run = Cli::new().run(args);
    run.assert_success();
    run
}

#[test]
fn piped_output_has_no_escape_codes_by_default() {
    // The test harness captures stdout, so it is never a terminal.
    let run = color_run(&["4d6dl1", "--seed", "3"]);
    assert!(!run.stdout.contains('\x1b'), "{:?}", run.stdout);
}

#[test]
fn color_always_dims_dropped_dice_and_bolds_the_total() {
    let plain = color_run(&["4d6dl1", "--seed", "3"]).stdout;
    let run = color_run(&["4d6dl1", "--seed", "3", "--color", "always"]);
    // Dropped dice stay in parentheses; the dim wraps the whole cell.
    let dropped = plain
        .split('(')
        .nth(1)
        .and_then(|s| s.split(')').next())
        .unwrap();
    assert!(
        run.stdout.contains(&format!("{DIM}({dropped}){RESET}")),
        "{:?}",
        run.stdout
    );
    let total = plain.trim_end().rsplit("→  ").next().unwrap();
    assert!(
        run.stdout
            .trim_end()
            .ends_with(&format!("{BOLD}{total}{RESET}")),
        "{:?}",
        run.stdout
    );
}

#[test]
fn color_never_and_no_color_turn_color_off() {
    let never = color_run(&["d20", "--seed", "1", "--color", "never"]);
    assert!(!never.stdout.contains('\x1b'));

    let out = Cli::new()
        .command()
        .env("NO_COLOR", "1")
        .args(["d20", "--seed", "1", "--color", "auto"])
        .output()
        .unwrap();
    assert!(!String::from_utf8(out.stdout).unwrap().contains('\x1b'));
}

#[test]
fn explicit_always_overrides_no_color_and_never_beats_it() {
    let run = |color: &str| {
        let out = Cli::new()
            .command()
            .env("NO_COLOR", "1")
            .args(["d20", "--seed", "1", "--color", color])
            .output()
            .unwrap();
        String::from_utf8(out.stdout).unwrap()
    };
    assert!(run("always").contains('\x1b'));
    assert!(!run("never").contains('\x1b'));
}

#[test]
fn empty_no_color_is_ignored() {
    // NO_COLOR only counts when non-empty; piped auto stays off anyway, so
    // check through `always`, which must still color.
    let out = Cli::new()
        .command()
        .env("NO_COLOR", "")
        .args(["d20", "--seed", "1", "--color", "always"])
        .output()
        .unwrap();
    assert!(String::from_utf8(out.stdout).unwrap().contains('\x1b'));
}

#[test]
fn natural_20_and_natural_1_are_highlighted_on_a_single_d20() {
    let hi = color_run(&["d20", "--seed", SEED_NAT20, "--color", "always"]);
    assert!(
        hi.stdout.contains(&format!("{NAT20}20{RESET}")),
        "{:?}",
        hi.stdout
    );
    let lo = color_run(&["d20", "--seed", SEED_NAT1, "--color", "always"]);
    assert!(
        lo.stdout.contains(&format!("{NAT1}1{RESET}")),
        "{:?}",
        lo.stdout
    );
}

#[test]
fn natural_highlight_works_with_a_flat_modifier() {
    let run = color_run(&["d20+5", "--seed", SEED_NAT20, "--color", "always"]);
    assert!(
        run.stdout.contains(&format!("{NAT20}20{RESET}")),
        "{:?}",
        run.stdout
    );
    let run = color_run(&["1d20-2", "--seed", SEED_NAT1, "--color", "always"]);
    assert!(
        run.stdout.contains(&format!("{NAT1}1{RESET}")),
        "{:?}",
        run.stdout
    );
}

#[test]
fn natural_highlight_is_limited_to_a_lone_d20_term() {
    for formula in ["d20+d4", "2d20kh1", "d20*2", "d12", "(d20)+1", "d100"] {
        let run = color_run(&[formula, "--seed", SEED_NAT20, "--color", "always"]);
        assert!(
            !run.stdout.contains(NAT20) && !run.stdout.contains(NAT1),
            "{formula}: {:?}",
            run.stdout
        );
    }
}

#[test]
fn verbose_lists_every_die_with_its_status_and_the_subtotal() {
    let cli = Cli::new();
    let json = cli.roll_json("4d6dl1", 3);
    let dice = common::flat_dice(&json["rolls"][0]["expr"]);
    let run = cli.run(&["-v", "4d6dl1", "--seed", "3"]);
    run.assert_success();
    let cells: Vec<String> = dice
        .iter()
        .map(|d| format!("{} {}", d["value"], d["status"].as_str().unwrap()))
        .collect();
    let subtotal = json["rolls"][0]["total"].as_i64().unwrap();
    assert_eq!(
        run.stdout,
        format!(
            "4d6dl1\n  4d6dl1: {} = {subtotal}\n  total: {subtotal}\n",
            cells.join(", ")
        )
    );
    assert!(run.stdout.contains("dropped") && run.stdout.contains("kept"));
}

#[test]
fn verbose_shows_each_term_its_operator_and_the_total() {
    let cli = Cli::new();
    let run = cli.run(&["-v", "2d6+1d4-3", "--seed", "3"]);
    run.assert_success();
    let lines: Vec<&str> = run.stdout.lines().collect();
    assert_eq!(lines[0], "2d6+1d4-3");
    assert!(lines[1].starts_with("  2d6: ") && lines[1].contains(" = "));
    assert!(lines[2].starts_with("  + 1d4: ") && lines[2].contains(" = "));
    assert_eq!(lines[3], "  - 3");
    let total = totals(&cli, "2d6+1d4-3", 3)[0];
    assert_eq!(lines[4], format!("  total: {total}"));
}

#[test]
fn verbose_handles_nested_expressions() {
    let cli = Cli::new();
    let run = cli.run(&["-v", "(d20+5)*2", "--seed", "3"]);
    run.assert_success();
    let total = totals(&cli, "(d20+5)*2", 3)[0];
    let lines: Vec<&str> = run.stdout.lines().collect();
    assert_eq!(lines[0], "(d20+5)*2");
    assert_eq!(lines[1], "  (");
    assert!(lines[2].starts_with("    d20: ") && lines[2].contains("kept"));
    assert_eq!(lines[3], "    + 5");
    assert!(lines[4].starts_with("  ) = "));
    assert_eq!(lines[5], "  * 2");
    assert_eq!(lines[6], format!("  total: {total}"));

    // Operator precedence nests too: the product is one bracketed unit.
    let run = cli.run(&["-v", "2+3*4"]);
    assert_eq!(
        run.stdout,
        "2+3*4\n  2\n  + (\n    3\n    * 4\n  ) = 12\n  total: 14\n"
    );
}

#[test]
fn verbose_prints_one_block_per_roll_separated_by_a_blank_line() {
    let run = Cli::new().run(&["-v", "d20+8, d10+5", "--seed", "1"]);
    run.assert_success();
    let blocks: Vec<&str> = run.stdout.trim_end().split("\n\n").collect();
    assert_eq!(blocks.len(), 2, "{:?}", run.stdout);
    assert!(blocks[0].starts_with("d20+8\n"));
    assert!(blocks[1].starts_with("d10+5\n"));
}

#[test]
fn verbose_color_dims_dropped_dice() {
    let run = color_run(&["-v", "4d6dl1", "--seed", "3", "--color", "always"]);
    assert!(
        run.stdout.contains(&format!("{DIM}1 dropped{RESET}")),
        "{:?}",
        run.stdout
    );
}

#[test]
fn json_ignores_verbose() {
    let cli = Cli::new();
    let plain = cli.roll_json("4d6dl1", 3);
    let run = cli.run(&["-v", "--json", "4d6dl1", "--seed", "3"]);
    assert_eq!(run.json(), plain);
}

#[test]
fn default_output_is_one_line_per_roll() {
    let run = Cli::new().run(&["4d6dl1, (d20+5)*2, 15", "--seed", "3"]);
    run.assert_success();
    assert_eq!(run.stdout.lines().count(), 3, "{:?}", run.stdout);
}

#[test]
fn json_dice_nodes_carry_their_sides() {
    let out = Cli::new().roll_json("2d6+d20", 1);
    let chain = &out["rolls"][0]["expr"];
    assert_eq!(chain["first"]["sides"], 6);
    assert_eq!(chain["rest"][0]["node"]["sides"], 20);
}
