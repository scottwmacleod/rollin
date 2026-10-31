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
