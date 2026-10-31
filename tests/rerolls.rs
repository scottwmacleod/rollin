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

#[test]
fn comparison_conditions_choose_which_faces_reroll() {
    let cli = Cli::new();
    type Case = (&'static str, fn(i64) -> bool);
    let cases: [Case; 6] = [
        ("4d6r<2", |v| v < 2),
        ("4d6r<=2", |v| v <= 2),
        ("4d6r>5", |v| v > 5),
        ("4d6r>=5", |v| v >= 5),
        ("4d6r=3", |v| v == 3),
        ("4D6 R <= 2", |v| v <= 2),
    ];
    for (formula, matches) in &cases {
        let mut rerolled = 0;
        for seed in SEEDS {
            let pool = dice(&cli, formula, seed);
            rerolled += pool.iter().filter(|d| status(d) == "rerolled").count();
            // A slot's first roll matches exactly when it was rerolled away;
            // the replacement after it may match and stands.
            for (j, d) in pool.iter().enumerate() {
                if status(d) == "rerolled" {
                    assert!(matches(value(d)), "{formula}: {pool:?}");
                    assert_ne!(status(&pool[j + 1]), "rerolled");
                } else if j == 0 || status(&pool[j - 1]) != "rerolled" {
                    assert!(!matches(value(d)), "{formula}: {pool:?}");
                }
            }
        }
        assert!(rerolled > 0, "{formula}: nothing rerolled in {SEEDS:?}");
    }
}

#[test]
fn rr_rerolls_until_the_die_no_longer_matches() {
    let cli = Cli::new();
    type Case = (&'static str, fn(i64) -> bool);
    let cases: [Case; 3] = [
        ("4d6rr1", |v| v == 1),
        ("4d6rr<=2", |v| v <= 2),
        ("4d6RR<3", |v| v < 3),
    ];
    for (formula, matches) in &cases {
        let mut chains_over_one = 0;
        for seed in SEEDS {
            let out = cli.roll_json(formula, seed);
            let pool = flat_dice(&out["rolls"][0]["expr"]);
            // Each slot is a run of rerolled dice then one standing die that
            // no longer matches.
            let mut run = 0;
            let mut slots = 0;
            for d in &pool {
                if status(d) == "rerolled" {
                    assert!(matches(value(d)), "{formula}: {pool:?}");
                    run += 1;
                } else {
                    assert!(!matches(value(d)), "{formula}: {pool:?}");
                    assert_eq!(status(d), "kept");
                    slots += 1;
                    chains_over_one += usize::from(run > 1);
                    run = 0;
                }
            }
            assert_eq!(run, 0, "pool ends on a standing die: {pool:?}");
            assert_eq!(slots, 4, "{formula} seed {seed}");
            let sum: i64 = pool.iter().filter(|d| status(d) != "rerolled").map(value).sum();
            assert_eq!(out["rolls"][0]["total"], sum);
        }
        assert!(chains_over_one > 0, "{formula}: no multi-reroll chain");
    }
}
