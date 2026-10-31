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

#[test]
fn conditions_choose_which_faces_explode() {
    let cli = Cli::new();
    let cases: [(&str, fn(i64) -> bool); 7] = [
        ("3d6!>5", |v| v > 5),
        ("3d6!>=5", |v| v >= 5),
        ("3d6!<2", |v| v < 2),
        ("3d6!<=2", |v| v <= 2),
        ("3d6!=3", |v| v == 3),
        ("3D6 ! >= 5", |v| v >= 5),
        ("3d6!>6", |_| false),
    ];
    for (formula, triggers) in &cases {
        let mut explosions = 0;
        for seed in SEEDS {
            let pool = dice(&cli, formula, seed);
            assert_explosion_chain(&pool, 3, 0, triggers);
            explosions += pool.iter().filter(|d| status(d) == "exploded").count();
        }
        assert_eq!(explosions > 0, *formula != "3d6!>6", "{formula}");
    }
}

#[test]
fn more_than_100_explosions_of_one_die_is_an_error_naming_cap_and_term() {
    // Seed 7 chains 130 explosions on a d100 that explodes on 2 or more.
    let run = Cli::new().run(&["--seed", "7", "--", "d100!>=2"]);
    assert!(!run.success(), "{run:?}");
    assert_eq!(run.stdout, "");
    assert_eq!(
        run.stderr,
        "error: explosions per die cap (100) exceeded by 'd100!>=2'\n  d100!>=2\n  ^^^^^^^^\n"
    );
}
