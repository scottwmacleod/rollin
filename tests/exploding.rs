//! Exploding dice at the CLI seam: `3d6!`, conditions, compounding,
//! penetrating, caps and static rejection.

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

/// Checks a plain/penetrating exploding pool: every die whose raw roll
/// satisfies `triggers` is immediately followed by an `exploded` die, and
/// `exploded` dice only ever follow a trigger. `offset` is what a penetrating
/// extra die has subtracted from its raw roll (0 for plain `!`).
fn assert_explosion_chain(
    pool: &[Value],
    originals: usize,
    offset: i64,
    triggers: impl Fn(i64) -> bool,
) {
    let mut seen_originals = 0;
    let mut prev_raw: Option<i64> = None;
    for d in pool {
        let exploded = status(d) == "exploded";
        let follows_trigger = prev_raw.is_some_and(&triggers);
        assert_eq!(exploded, follows_trigger, "pool: {pool:?}");
        if !exploded {
            seen_originals += 1;
        }
        prev_raw = Some(value(d) + if exploded { offset } else { 0 });
    }
    assert!(
        !prev_raw.is_some_and(&triggers),
        "last die should not trigger: {pool:?}"
    );
    assert_eq!(seen_originals, originals, "pool: {pool:?}");
}

#[test]
fn bang_explodes_dice_showing_their_maximum() {
    let cli = Cli::new();
    let mut explosions = 0;
    for seed in SEEDS {
        let pool = dice(&cli, "3d6!", seed);
        assert_explosion_chain(&pool, 3, 0, |v| v == 6);
        explosions += pool.iter().filter(|d| status(d) == "exploded").count();
        let out = cli.roll_json("3d6!", seed);
        let sum: i64 = pool.iter().map(value).sum();
        assert_eq!(out["rolls"][0]["total"], sum);
    }
    assert!(explosions > 0, "no seed in {SEEDS:?} exploded");
}
