mod common;

use common::{flat_dice, Cli};

/// Parses `d20  [14]  →  14` into (dice, total).
fn parse_line(line: &str) -> (Vec<u32>, u32) {
    let (left, total) = line.split_once("→").expect("arrow in output");
    let total = total.trim().parse().expect("numeric total");
    let dice = left
        .split_once('[')
        .and_then(|(_, r)| r.split_once(']'))
        .expect("bracketed dice")
        .0
        .split_whitespace()
        .map(|d| d.parse().expect("numeric die"))
        .collect();
    (dice, total)
}

#[test]
fn d20_with_seed_prints_a_deterministic_roll() {
    let cli = Cli::new();
    let first = cli.run(&["d20", "--seed", "1"]);
    first.assert_success();

    let line = first.stdout.trim_end();
    assert!(line.starts_with("d20  ["), "unexpected line: {line:?}");
    let (dice, total) = parse_line(line);
    assert_eq!(dice.len(), 1);
    assert!((1..=20).contains(&dice[0]));
    assert_eq!(total, dice[0]);

    let second = cli.run(&["d20", "--seed", "1"]);
    assert_eq!(first.stdout, second.stdout, "same seed must repeat");
}

/// Splits `4d6dl1  [5, 3, 4, (1)]  →  12` into (formula, dice cells, modifier text, total).
fn parse_human(line: &str) -> (String, Vec<String>, String, i64) {
    let (left, total) = line.split_once("  →  ").expect("arrow in output");
    let (formula, rest) = left.split_once("  [").expect("bracketed dice");
    let (cells, modifier) = rest.split_once(']').expect("closing bracket");
    let cells = cells.split(", ").map(str::to_string).collect();
    (
        formula.to_string(),
        cells,
        modifier.trim().to_string(),
        total.trim().parse().expect("numeric total"),
    )
}

#[test]
fn dropped_dice_show_in_parentheses_and_leave_the_total() {
    let cli = Cli::new();
    let run = cli.run(&["4d6dl1", "--seed", "3"]);
    run.assert_success();
    let (formula, cells, modifier, total) = parse_human(run.stdout.trim_end());
    assert_eq!(formula, "4d6dl1");
    assert_eq!(modifier, "");
    assert_eq!(cells.len(), 4);
    let dropped: Vec<&String> = cells.iter().filter(|c| c.starts_with('(')).collect();
    assert_eq!(dropped.len(), 1, "cells: {cells:?}");
    let value = |c: &str| c.trim_matches(['(', ')']).parse::<i64>().unwrap();
    let min = cells.iter().map(|c| value(c)).min().unwrap();
    assert_eq!(value(dropped[0]), min);
    let kept: i64 = cells
        .iter()
        .filter(|c| !c.starts_with('('))
        .map(|c| value(c))
        .sum();
    assert_eq!(total, kept);
}

#[test]
fn modifier_is_shown_after_the_dice() {
    let cli = Cli::new();
    for (formula, shown) in [("3d8+5", "+ 5"), ("2d6-2", "- 2")] {
        let run = cli.run(&[formula, "--seed", "5"]);
        run.assert_success();
        let (f, cells, modifier, total) = parse_human(run.stdout.trim_end());
        assert_eq!(f, formula);
        assert_eq!(modifier, shown);
        let sum: i64 = cells.iter().map(|c| c.parse::<i64>().unwrap()).sum();
        let m: i64 = shown.replace(' ', "").parse().unwrap();
        assert_eq!(total, sum + m);
    }
}

#[test]
fn comma_list_prints_one_line_per_roll() {
    let cli = Cli::new();
    // Quoted as one argument and unquoted (the shell splits on spaces).
    for args in [vec!["d20+8, d10+5"], vec!["d20+8,", "d10+5"]] {
        let mut full = args.clone();
        full.extend(["--seed", "2"]);
        let run = cli.run(&full);
        run.assert_success();
        let lines: Vec<&str> = run.stdout.lines().collect();
        assert_eq!(lines.len(), 2, "{lines:?}");
        assert!(lines[0].starts_with("d20+8  ["), "{lines:?}");
        assert!(lines[1].starts_with("d10+5  ["), "{lines:?}");
    }
}

#[test]
fn bare_number_is_its_own_total() {
    let cli = Cli::new();
    let run = cli.run(&["15"]);
    run.assert_success();
    assert_eq!(run.stdout, "15  →  15\n");
    let run = cli.run(&["d20, 15", "--seed", "1"]);
    run.assert_success();
    assert_eq!(run.stdout.lines().nth(1), Some("15  →  15"));
}

#[test]
fn json_marks_each_die_kept_or_dropped() {
    let cli = Cli::new();
    let out = cli.roll_json("4d6dl1", 3);
    let dice = flat_dice(&out["rolls"][0]["expr"]);
    let statuses: Vec<&str> = dice.iter().map(|d| d["status"].as_str().unwrap()).collect();
    assert_eq!(statuses.iter().filter(|s| **s == "dropped").count(), 1);
    assert_eq!(statuses.iter().filter(|s| **s == "kept").count(), 3);
}

#[test]
fn invalid_formulas_fail_with_a_message_not_a_panic() {
    let cli = Cli::new();
    for bad in [
        "xyz",
        "",
        "d",
        "2d6dl9",
        "d20+",
        "d20 d6",
        "99999999999999999999d6",
        "d20+d6",
        "4d6dlx",
    ] {
        let run = cli.run(&[bad]);
        assert!(!run.success(), "{bad:?} should fail: {run:?}");
        assert!(run.stderr.starts_with("error: "), "{bad:?}: {run:?}");
        assert!(!run.stderr.contains("panicked"), "{bad:?}: {run:?}");
        assert!(run.stdout.is_empty(), "{bad:?}: {run:?}");
    }
}

#[test]
fn signed_bare_numbers_are_accepted_like_v1() {
    // `--` is needed so the shell-level argument parser does not take `-5` for a flag.
    let cli = Cli::new();
    for (arg, line) in [("-5", "-5  →  -5"), ("+5", "+5  →  5")] {
        let run = cli.run(&["--seed", "1", "--", arg]);
        run.assert_success();
        assert_eq!(run.stdout.trim_end(), line);
    }
}
