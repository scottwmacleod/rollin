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
