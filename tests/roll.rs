mod common;

use common::Cli;

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
