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
