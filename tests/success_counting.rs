//! Success counting at the CLI seam: `6d10>=8`, failure clauses, ordering
//! with the other modifiers, and the type rule against arithmetic.

mod common;

use common::{flat_dice, Cli};
use serde_json::Value;

const SEEDS: std::ops::Range<u64> = 0..60;

fn value(d: &Value) -> i64 {
    d["value"].as_i64().unwrap()
}

fn status(d: &Value) -> &str {
    d["status"].as_str().unwrap()
}

/// The dice of the first roll of `formula --seed seed --json`.
fn dice(cli: &Cli, formula: &str, seed: u64) -> Vec<Value> {
    flat_dice(&cli.roll_json(formula, seed)["rolls"][0]["expr"])
}

#[test]
fn ge_counts_the_dice_that_meet_the_condition() {
    let cli = Cli::new();
    let mut nonzero = 0;
    for seed in SEEDS {
        let out = cli.roll_json("6d10>=8", seed);
        let pool = flat_dice(&out["rolls"][0]["expr"]);
        let hits = pool.iter().filter(|d| value(d) >= 8).count() as i64;
        assert_eq!(out["rolls"][0]["total"], hits, "seed {seed}: {pool:?}");
        nonzero += i64::from(hits > 0);
    }
    assert!(nonzero > 0, "no seed in {SEEDS:?} had a success");
}

#[test]
fn json_marks_the_roll_as_a_count_with_per_die_outcomes_and_tallies() {
    let cli = Cli::new();
    for seed in SEEDS {
        let out = cli.roll_json("6d10>=8", seed);
        let roll = &out["rolls"][0];
        let node = &roll["expr"];
        assert_eq!(out["schema_version"], 1);
        assert_eq!(roll["kind"], "count", "seed {seed}");
        assert_eq!(node["kind"], "count", "seed {seed}");
        let pool = flat_dice(node);
        let mut hits = 0;
        for d in &pool {
            if value(d) >= 8 {
                assert_eq!(d["outcome"], "success", "seed {seed}: {pool:?}");
                hits += 1;
            } else {
                // The outcome field is present only on dice that matched.
                assert!(d.get("outcome").is_none(), "seed {seed}: {pool:?}");
            }
        }
        assert_eq!(node["successes"], hits, "seed {seed}");
        assert_eq!(node["failures"], 0, "seed {seed}");
    }
}

#[test]
fn json_leaves_sum_rolls_without_count_fields() {
    let out = Cli::new().roll_json("6d10", 3);
    let roll = &out["rolls"][0];
    assert!(roll.get("kind").is_none(), "{roll}");
    let node = &roll["expr"];
    for field in ["kind", "successes", "failures"] {
        assert!(node.get(field).is_none(), "{field} on a sum: {node}");
    }
    assert!(flat_dice(node).iter().all(|d| d.get("outcome").is_none()));
}

#[test]
fn a_failure_clause_subtracts_and_marks_failing_dice() {
    let cli = Cli::new();
    type Case = (&'static str, fn(i64) -> bool, fn(i64) -> bool);
    let cases: [Case; 6] = [
        ("6d10>=8f1", |v| v >= 8, |v| v == 1),
        ("6d10>7f<=2", |v| v > 7, |v| v <= 2),
        ("6d10<=3f>9", |v| v <= 3, |v| v > 9),
        ("6d10=10f=1", |v| v == 10, |v| v == 1),
        ("6d10>=8 f1", |v| v >= 8, |v| v == 1),
        ("6D10>=8 F<2", |v| v >= 8, |v| v < 2),
    ];
    for (formula, wins, loses) in &cases {
        let (mut negative, mut with_failures) = (false, false);
        for seed in SEEDS {
            let out = cli.roll_json(formula, seed);
            let node = &out["rolls"][0]["expr"];
            let pool = flat_dice(node);
            let hits = pool.iter().filter(|d| wins(value(d))).count() as i64;
            let misses = pool.iter().filter(|d| loses(value(d))).count() as i64;
            for d in &pool {
                let expected = match (wins(value(d)), loses(value(d))) {
                    (true, _) => Some("success"),
                    (false, true) => Some("failure"),
                    _ => None,
                };
                assert_eq!(
                    d.get("outcome").and_then(Value::as_str),
                    expected,
                    "{formula}"
                );
            }
            assert_eq!(node["successes"], hits, "{formula} seed {seed}");
            assert_eq!(node["failures"], misses, "{formula} seed {seed}");
            assert_eq!(
                out["rolls"][0]["total"],
                hits - misses,
                "{formula} seed {seed}"
            );
            assert_eq!(node["subtotal"], hits - misses);
            negative |= hits < misses;
            with_failures |= misses > 0;
        }
        assert!(with_failures, "{formula}: no failures in {SEEDS:?}");
        assert!(
            negative || *formula == "6d10=10f=1",
            "{formula}: never went negative"
        );
    }
}
