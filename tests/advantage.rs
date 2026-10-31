//! Advantage and disadvantage at the CLI seam: `d20adv` is `2d20kh1` and
//! `d20dis` is `2d20kl1`, down to the RNG draws.

mod common;

use common::Cli;
use serde_json::Value;

/// A roll's tree with the text that legitimately differs (what the user
/// typed) removed, so two spellings can be compared draw for draw.
fn without_text(node: &Value) -> Value {
    match node {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(k, _)| !matches!(k.as_str(), "formula" | "term"))
                .map(|(k, v)| (k.clone(), without_text(v)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(without_text).collect()),
        other => other.clone(),
    }
}

#[test]
fn advantage_matches_keep_highest_of_two_under_the_same_seed() {
    let cli = Cli::new();
    for seed in 0..40 {
        // The trailing terms prove the RNG stream is consumed identically.
        let adv = cli.roll_json("d20adv+d6, d20", seed);
        let kh = cli.roll_json("2d20kh1+d6, d20", seed);
        assert_eq!(without_text(&adv), without_text(&kh), "seed {seed}");
    }
}

#[test]
fn disadvantage_matches_keep_lowest_of_two_under_the_same_seed() {
    let cli = Cli::new();
    for seed in 0..40 {
        let dis = cli.roll_json("d20dis+d6, d20", seed);
        let kl = cli.roll_json("2d20kl1+d6, d20", seed);
        assert_eq!(without_text(&dis), without_text(&kl), "seed {seed}");
    }
}

/// Runs a formula expected to fail and returns its stderr.
#[track_caller]
fn failure(formula: &str) -> String {
    let run = Cli::new().run(&["--seed", "1", "--", formula]);
    assert!(!run.success(), "{formula:?} should fail: {run:?}");
    assert!(run.stdout.is_empty(), "{formula:?}: {run:?}");
    run.stderr
}

#[test]
fn advantage_on_more_than_one_die_is_an_error_underlining_the_term() {
    assert_eq!(
        failure("2d20adv"),
        "error: 'adv' applies to exactly one die; write d20adv, or 2d20kh1 to keep the highest of two\n  2d20adv\n  ^^^^^^^\n"
    );
    assert_eq!(
        failure("d6+3D8DIS"),
        "error: 'dis' applies to exactly one die; write d8dis, or 2d8kl1 to keep the lowest of two\n  d6+3D8DIS\n     ^^^^^^\n"
    );
}

#[test]
fn adv_and_dis_cannot_be_combined_with_keep_or_drop() {
    // (formula, which suffix is named, byte column of the second clause, its width)
    let cases = [
        ("d20advdl1", "adv", 6, 2),
        ("d20 dis KH1", "dis", 8, 2),
        ("3d20kh1adv", "adv", 7, 3),
        ("3d20DL2dis", "dis", 7, 3),
    ];
    for (formula, word, col, width) in cases {
        assert_eq!(
            failure(formula),
            format!(
                "error: '{word}' already keeps one die, so it cannot be combined with dl, dh, kl or kh\n  {formula}\n  {}{}\n",
                " ".repeat(col),
                "^".repeat(width)
            ),
            "{formula}"
        );
    }
}

fn dice_values(cli: &Cli, formula: &str, seed: u64) -> Vec<(i64, String)> {
    let out = cli.roll_json(formula, seed);
    common::flat_dice(&out["rolls"][0]["expr"])
        .iter()
        .map(|d| {
            (
                d["value"].as_i64().unwrap(),
                d["status"].as_str().unwrap().to_string(),
            )
        })
        .collect()
}

#[test]
fn advantage_keeps_the_higher_die_and_drops_the_other() {
    let cli = Cli::new();
    for seed in 0..40 {
        let adv = dice_values(&cli, "d20adv", seed);
        let dis = dice_values(&cli, "d20dis", seed);
        for (pool, keeps_high) in [(&adv, true), (&dis, false)] {
            assert_eq!(pool.len(), 2, "seed {seed}");
            let (hi, lo) = (pool[0].0.max(pool[1].0), pool[0].0.min(pool[1].0));
            let kept: Vec<_> = pool.iter().filter(|d| d.1 == "kept").collect();
            let dropped = pool.iter().filter(|d| d.1 == "dropped").count();
            assert_eq!((kept.len(), dropped), (1, 1), "seed {seed}: {pool:?}");
            assert_eq!(kept[0].0, if keeps_high { hi } else { lo }, "seed {seed}");
        }
    }
}

#[test]
fn modifiers_parentheses_and_other_modifiers_combine_with_adv_and_dis() {
    let cli = Cli::new();
    for seed in 0..20 {
        let same = |a: &str, b: &str| {
            assert_eq!(
                without_text(&cli.roll_json(a, seed)),
                without_text(&cli.roll_json(b, seed)),
                "{a} vs {b}, seed {seed}"
            );
        };
        same("d20adv+8", "2d20kh1+8");
        same("1d20ADV - 2", "2d20kh1-2");
        same("(d20dis+3)*2", "(2d20kl1+3)*2");
        same("d20r1adv", "2d20r1kh1");
        same("d20!dis", "2d20!kl1");
        same("d10adv>=7", "2d10kh1>=7");
    }
}

#[test]
fn the_formula_echo_shows_what_was_typed() {
    let run = Cli::new().run(&["--seed", "1", "D20ADV+8"]);
    run.assert_success();
    assert!(run.stdout.starts_with("D20ADV+8  "), "{}", run.stdout);
}

#[test]
fn default_output_shows_both_dice_with_the_loser_dropped() {
    let run = Cli::new().run(&["--seed", "1", "d20adv"]);
    run.assert_success();
    let line = run.stdout.trim();
    let dice = line.split("  ").nth(1).unwrap();
    assert!(
        dice.starts_with('[') && dice.contains("(") && dice.contains(", "),
        "{line}"
    );
}

#[test]
fn natural_highlights_never_apply_to_advantage() {
    let cli = Cli::new();
    let mut saw_natural = false;
    for seed in 0..200 {
        let run = cli.run(&["--seed", &seed.to_string(), "--color", "always", "d20adv"]);
        let high = dice_values(&cli, "d20adv", seed)
            .iter()
            .any(|d| d.0 == 20 && d.1 == "kept");
        let low = dice_values(&cli, "d20adv", seed)
            .iter()
            .any(|d| d.0 == 1 && d.1 == "kept");
        saw_natural |= high || low;
        assert!(
            !run.stdout.contains("1;32") && !run.stdout.contains("1;31"),
            "seed {seed}: {}",
            run.stdout
        );
    }
    assert!(saw_natural, "no natural 20 or 1 in the sample");
}
