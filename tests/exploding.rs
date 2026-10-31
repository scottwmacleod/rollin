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

#[test]
fn double_bang_compounds_extra_rolls_into_one_die() {
    let cli = Cli::new();
    let cases: [(&str, fn(i64) -> bool); 3] = [
        ("3d6!!", |v| v == 6),
        ("3d6!!>4", |v| v > 4),
        ("3d6!! <= 2", |v| v <= 2),
    ];
    for (formula, triggers) in &cases {
        let mut compounded = 0;
        for seed in SEEDS {
            let out = cli.roll_json(formula, seed);
            let pool = flat_dice(&out["rolls"][0]["expr"]);
            assert_eq!(pool.len(), 3, "{formula} seed {seed}: one entry per die");
            for d in &pool {
                assert_eq!(status(d), "kept");
                let parts: Vec<i64> = match d["parts"].as_array() {
                    Some(p) => p.iter().map(|v| v.as_i64().unwrap()).collect(),
                    None => vec![value(d)],
                };
                assert_eq!(parts.iter().sum::<i64>(), value(d), "{d}");
                let (last, earlier) = parts.split_last().unwrap();
                assert!(earlier.iter().all(|&p| triggers(p)), "{formula}: {d}");
                assert!(!triggers(*last), "{formula}: {d}");
                compounded += earlier.len();
            }
            let sum: i64 = pool.iter().map(value).sum();
            assert_eq!(out["rolls"][0]["total"], sum);
        }
        assert!(compounded > 0, "{formula}: nothing compounded");
    }
}

#[test]
fn bang_p_penetrates_so_each_extra_roll_counts_one_less() {
    let cli = Cli::new();
    let cases: [(&str, fn(i64) -> bool); 3] = [
        ("3d6!p", |v| v == 6),
        ("3d6!p>4", |v| v > 4),
        ("3D6 ! P <= 2", |v| v <= 2),
    ];
    for (formula, triggers) in &cases {
        let mut extras = 0;
        for seed in SEEDS {
            let out = cli.roll_json(formula, seed);
            let pool = flat_dice(&out["rolls"][0]["expr"]);
            assert_explosion_chain(&pool, 3, 1, triggers);
            // No floor: a raw 1 contributes 0.
            extras += pool.iter().filter(|d| status(d) == "exploded").count();
            let sum: i64 = pool.iter().map(value).sum();
            assert_eq!(out["rolls"][0]["total"], sum);
        }
        assert!(extras > 0, "{formula}: nothing penetrated");
    }
}

/// Runs a formula expected to fail and returns its stderr.
#[track_caller]
fn failure(formula: &str) -> String {
    let run = Cli::new().run(&["--seed", "1", "--", formula]);
    assert!(!run.success(), "{formula:?} should fail: {run:?}");
    assert!(run.stdout.is_empty(), "{formula:?}: {run:?}");
    run.stderr
}

#[test]
fn conditions_true_on_every_face_are_rejected_before_rolling() {
    for formula in [
        "d6!>0", "d6!>=1", "d6!<7", "d6!<=6", "d6!>=0", "d2!<=2", "d6!!>=1", "d6!!<7", "d6!p>=1",
        "d6!p<=6", "3d6!<=6",
    ] {
        let err = failure(formula);
        assert!(
            err.starts_with("error: ") && err.contains("every face"),
            "{formula}: {err}"
        );
    }
}

#[test]
fn the_always_exploding_error_underlines_the_explode_clause() {
    assert_eq!(
        failure("2d6+d6!>=1"),
        "error: explosion condition '!>=1' is true for every face of a d6, so it would never stop\n  2d6+d6!>=1\n        ^^^^\n"
    );
    assert_eq!(
        failure("d6 !! < 7"),
        "error: explosion condition '!! < 7' is true for every face of a d6, so it would never stop\n  d6 !! < 7\n     ^^^^^^\n"
    );
}

#[test]
fn a_d1_that_always_explodes_is_rejected_statically() {
    assert_eq!(
        failure("d1!"),
        "error: sides must be between 2 and 10000\n  d1!\n   ^\n"
    );
}

#[test]
fn conditions_that_never_hold_are_allowed_and_never_explode() {
    let cli = Cli::new();
    for formula in ["d6!>6", "d6!<1", "d6!=7", "d6!!>6", "d6!p=0"] {
        for seed in 0..20 {
            let pool = dice(&cli, formula, seed);
            assert_eq!(pool.len(), 1, "{formula}");
            assert_eq!(status(&pool[0]), "kept");
        }
    }
}

#[test]
fn an_explode_condition_needs_a_number() {
    for formula in ["d6!>", "d6!=", "d6!!<=", "d6!p>="] {
        let err = failure(formula);
        assert!(
            err.contains("expected a number after the explode condition"),
            "{formula}: {err}"
        );
    }
}

#[test]
fn explosions_happen_before_keep_and_drop_which_see_every_die() {
    let cli = Cli::new();
    // (formula, number of dice kept, keeps the highest?)
    let cases = [
        ("4d6!dl1", None, 1),
        ("4d6!kh2", Some(2), 0),
        ("4d6!!kh2", Some(2), 0),
        ("4d6!pkh2", Some(2), 0),
        ("4d6!>4dh", None, 1),
    ];
    let mut bigger_pools = 0;
    for (formula, keeps, drops) in cases {
        for seed in SEEDS {
            let out = cli.roll_json(formula, seed);
            let pool = flat_dice(&out["rolls"][0]["expr"]);
            let kept: Vec<i64> = pool
                .iter()
                .filter(|d| status(d) != "dropped")
                .map(value)
                .collect();
            let dropped: Vec<i64> = pool
                .iter()
                .filter(|d| status(d) == "dropped")
                .map(value)
                .collect();
            match keeps {
                Some(k) => assert_eq!(kept.len(), k, "{formula} seed {seed}: {pool:?}"),
                None => assert_eq!(dropped.len(), drops, "{formula} seed {seed}: {pool:?}"),
            }
            let (lo, hi) = (kept.iter().min(), kept.iter().max());
            if formula.contains("dl") {
                assert!(dropped.iter().all(|d| Some(d) <= lo), "{formula}: {pool:?}");
            } else if formula.contains("dh") {
                assert!(dropped.iter().all(|d| Some(d) >= hi), "{formula}: {pool:?}");
            } else {
                assert!(dropped.iter().all(|d| Some(d) <= lo), "{formula}: {pool:?}");
            }
            assert_eq!(out["rolls"][0]["total"], kept.iter().sum::<i64>());
            if pool.len() > 4 && !formula.contains("!!") {
                bigger_pools += 1;
            }
        }
    }
    assert!(bigger_pools > 0, "no explosion reached keep/drop");
}

#[test]
fn exploded_dice_count_toward_the_dice_per_expression_cap() {
    // Each 1000d4!>=2 rolls about 4000 dice, though only 3000 are written.
    let err = failure("1000d4!>=2 + 1000d4!>=2 + 1000d4!>=2");
    assert!(
        err.starts_with("error: dice per expression cap (10000) exceeded by '1000d4!>=2'\n"),
        "{err}"
    );
}

#[test]
fn compounded_extra_rolls_count_toward_the_dice_per_expression_cap() {
    let err = failure("1000d4!!>=2 + 1000d4!!>=2 + 1000d4!!>=2");
    assert!(
        err.starts_with("error: dice per expression cap (10000) exceeded by '1000d4!!>=2'\n"),
        "{err}"
    );
}
