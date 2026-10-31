//! Rerolls at the CLI seam: `r`, `rr`, conditions, ordering, caps and
//! static rejection.

mod common;

use common::{flat_dice, Cli};
use serde_json::Value;

const SEEDS: std::ops::Range<u64> = 0..60;

/// The dice of the first roll of `formula --seed seed --json`.
fn dice(cli: &Cli, formula: &str, seed: u64) -> Vec<Value> {
    flat_dice(&cli.roll_json(formula, seed)["rolls"][0]["expr"])
}

fn value(d: &Value) -> i64 {
    d["value"].as_i64().unwrap()
}

fn status(d: &Value) -> &str {
    d["status"].as_str().unwrap()
}

#[test]
fn r_rerolls_a_matching_die_once_and_the_second_result_stands() {
    let cli = Cli::new();
    let (mut rerolled, mut second_one_stood) = (0, 0);
    for seed in SEEDS {
        let out = cli.roll_json("4d6r1", seed);
        let pool = flat_dice(&out["rolls"][0]["expr"]);
        // Every rerolled-away die showed 1 and is replaced by the next die.
        for (i, d) in pool.iter().enumerate() {
            if status(d) == "rerolled" {
                assert_eq!(value(d), 1, "seed {seed}: {pool:?}");
                assert_ne!(status(&pool[i + 1]), "rerolled", "r rerolls only once");
                rerolled += 1;
                if value(&pool[i + 1]) == 1 {
                    second_one_stood += 1;
                }
            }
        }
        // Four dice stand; none of them was rerolled away.
        let standing: Vec<&Value> = pool.iter().filter(|d| status(d) != "rerolled").collect();
        assert_eq!(standing.len(), 4, "seed {seed}: {pool:?}");
        // A rerolled die does not count toward the total.
        let sum: i64 = standing.iter().map(|d| value(d)).sum();
        assert_eq!(out["rolls"][0]["total"], sum, "seed {seed}");
    }
    assert!(rerolled > 0, "no seed in {SEEDS:?} rerolled");
    assert!(second_one_stood > 0, "no seed kept a second 1");
}
