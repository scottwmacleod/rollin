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
