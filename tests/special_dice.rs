//! Percentile (`d%`) and fudge (`dF`) dice at the CLI seam.

mod common;

use common::{flat_dice, Cli};
use serde_json::Value;

/// A roll's tree with the text and die-type marker that legitimately differ
/// between spellings removed.
fn without_text(node: &Value) -> Value {
    match node {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(k, _)| !matches!(k.as_str(), "formula" | "term" | "special"))
                .map(|(k, v)| (k.clone(), without_text(v)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(without_text).collect()),
        other => other.clone(),
    }
}

#[test]
fn percentile_is_a_d100_under_the_same_seed() {
    let cli = Cli::new();
    for seed in 0..40 {
        for (pct, d100) in [
            ("d%", "d100"),
            ("1d%", "1d100"),
            ("2d%", "2d100"),
            ("3D%dl1", "3d100dl1"),
            ("d%+d6, d%", "d100+d6, d100"),
            ("4d%>=90", "4d100>=90"),
            ("d%!", "d100!"),
        ] {
            assert_eq!(
                without_text(&cli.roll_json(pct, seed)),
                without_text(&cli.roll_json(d100, seed)),
                "{pct} vs {d100}, seed {seed}"
            );
        }
    }
}

#[test]
fn percentile_dice_roll_one_to_one_hundred() {
    let cli = Cli::new();
    let mut seen = std::collections::BTreeSet::new();
    for seed in 0..100 {
        for d in flat_dice(&cli.roll_json("5d%", seed)["rolls"][0]["expr"]) {
            let v = d["value"].as_i64().unwrap();
            assert!((1..=100).contains(&v), "seed {seed}: {v}");
            seen.insert(v);
        }
    }
    assert!(seen.len() > 50, "suspiciously few distinct values: {}", seen.len());
}
