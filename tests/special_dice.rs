//! Percentile (`d%`) dice at the CLI seam.

mod common;

use common::{flat_dice, Cli};
use serde_json::Value;

/// A roll's tree with the text and die-type marker that legitimately differ
/// between spellings removed.
fn without_text(node: &Value) -> Value {
    match node {
        // A reason names the clause as written, but its `from` is compared.
        Value::Object(map) if map.contains_key("clause") => Value::Object(
            map.iter()
                .filter(|(k, _)| k.as_str() != "clause")
                .map(|(k, v)| (k.clone(), without_text(v)))
                .collect(),
        ),
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(k, _)| {
                    !matches!(k.as_str(), "formula" | "term" | "special" | "modifiers")
                })
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
    assert!(
        seen.len() > 50,
        "suspiciously few distinct values: {}",
        seen.len()
    );
}

#[test]
fn percentile_works_with_advantage_like_any_single_die() {
    let cli = Cli::new();
    for seed in 0..20 {
        assert_eq!(
            without_text(&cli.roll_json("d%adv", seed)),
            without_text(&cli.roll_json("2d100kh1", seed)),
            "seed {seed}"
        );
    }
}

#[test]
fn json_marks_percentile_groups_and_echoes_the_term_as_typed() {
    let out = Cli::new().roll_json("2D%", 3);
    let node = &out["rolls"][0]["expr"];
    assert_eq!(node["term"], "2D%");
    assert_eq!(node["sides"], 100);
    assert_eq!(node["special"], "percentile");
    let ordinary = Cli::new().roll_json("2d100", 3);
    assert!(ordinary["rolls"][0]["expr"].get("special").is_none());
    assert_eq!(out["schema_version"], 1);
}

#[test]
fn default_output_echoes_percentile_as_typed() {
    let cli = Cli::new();
    let run = cli.run(&["--seed", "99", "2d%"]);
    run.assert_success();
    assert!(run.stdout.starts_with("2d%  ["), "{}", run.stdout);
    let run = cli.run(&["--seed", "99", "d%"]);
    run.assert_success();
    assert!(run.stdout.starts_with("d%  ["), "{}", run.stdout);
}

#[track_caller]
fn stderr_of(formula: &str) -> String {
    let run = Cli::new().run(&["--seed", "1", "--", formula]);
    assert!(
        !run.success() && run.stdout.is_empty(),
        "{formula}: {run:?}"
    );
    run.stderr
}

#[test]
fn ordinary_dice_keep_their_sides_validation() {
    for formula in ["d1", "d0", "d10001", "2d1"] {
        assert!(
            stderr_of(formula).starts_with("error: sides must be between 2 and 10000"),
            "{formula}"
        );
    }
    Cli::new()
        .run(&["--seed", "1", "d2+d10000"])
        .assert_success();
}

#[test]
fn failure_clauses_still_lex() {
    let cli = Cli::new();
    for formula in ["6d10>=8f1", "6D10>=8F1", "6d10>=8 f1", "6d10>7f<=2"] {
        cli.run(&["--seed", "2", "--", formula]).assert_success();
    }
    let out = cli.roll_json("6d10>=8f1", 2);
    assert_eq!(out["rolls"][0]["kind"], "count");
    assert_eq!(out["rolls"][0]["expr"]["failures"], 1);
}

#[test]
fn fudge_dice_are_not_supported_and_are_a_typed_error() {
    for formula in ["dF", "4dF", "4df", "4dF+2"] {
        let run = Cli::new().run(&["--seed", "1", "--", formula]);
        assert!(
            !run.success() && run.stdout.is_empty(),
            "{formula}: {run:?}"
        );
        assert!(run.stderr.starts_with("error: "), "{formula}: {run:?}");
        assert!(run.stderr.contains(formula), "{formula}: {run:?}");
        assert!(!run.stderr.contains("panicked"), "{formula}: {run:?}");
    }
}
