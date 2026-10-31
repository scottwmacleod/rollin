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
            let sum: i64 = pool
                .iter()
                .filter(|d| status(d) != "rerolled")
                .map(value)
                .sum();
            assert_eq!(out["rolls"][0]["total"], sum);
        }
        assert!(chains_over_one > 0, "{formula}: no multi-reroll chain");
    }
}

fn failure(formula: &str) -> String {
    let run = Cli::new().run(&["--seed", "1", "--", formula]);
    assert!(!run.success(), "{formula} should fail: {run:?}");
    assert_eq!(run.stdout, "");
    run.stderr
}

#[test]
fn rr_that_matches_every_face_is_rejected_before_rolling() {
    assert_eq!(
        failure("2d6+d6rr<=6"),
        "error: reroll condition 'rr<=6' is true for every face of a d6, so it would never stop\n  2d6+d6rr<=6\n        ^^^^^\n"
    );
    for formula in ["d6rr>=1", "d6rr<7", "d6 RR > 0", "d20rr<=20"] {
        let stderr = failure(formula);
        assert!(
            stderr.contains("is true for every face"),
            "{formula}: {stderr}"
        );
    }
}

#[test]
fn r_with_an_always_true_condition_is_allowed_and_rerolls_every_die_once() {
    let cli = Cli::new();
    let pool = dice(&cli, "3d6r<=6", 4);
    assert_eq!(pool.len(), 6);
    assert_eq!(
        pool.iter().filter(|d| status(d) == "rerolled").count(),
        3,
        "{pool:?}"
    );
}

#[test]
fn a_condition_that_never_matches_is_a_no_op() {
    let cli = Cli::new();
    for formula in ["4d6r>6", "4d6rr>6", "4d6r=0", "4d6rr<1"] {
        let pool = dice(&cli, formula, 3);
        assert_eq!(pool.len(), 4, "{formula}");
        assert!(pool.iter().all(|d| status(d) == "kept"), "{formula}");
    }
}

#[test]
fn rerolled_dice_count_toward_the_dice_per_expression_cap() {
    // Each term rolls 2000 dice (every die rerolled once): five fit exactly,
    // the sixth does not, though only 6000 dice are written.
    let five = ["1000d6r<=6"; 5].join("+");
    let run = Cli::new().run(&["--seed", "1", "--json", "--", &five]);
    run.assert_success();
    let six = ["1000d6r<=6"; 6].join("+");
    let stderr = failure(&six);
    assert!(
        stderr.starts_with("error: dice per expression cap (10000) exceeded by '1000d6r<=6'"),
        "{stderr}"
    );
}

#[test]
fn more_than_100_rerolls_of_one_die_is_an_error_naming_cap_and_term() {
    // Seed 3 rerolls a d100 that rerolls on 99 or less more than 100 times.
    let run = Cli::new().run(&["--seed", "3", "--", "d100rr<=99"]);
    assert!(!run.success(), "{run:?}");
    assert_eq!(run.stdout, "");
    assert_eq!(
        run.stderr,
        "error: rerolls per die cap (100) exceeded by 'd100rr<=99'\n  d100rr<=99\n  ^^^^^^^^^^\n"
    );
}

#[test]
fn a_reroll_without_a_condition_is_a_parse_error() {
    assert_eq!(
        failure("4d6r"),
        "error: expected a reroll condition (a number, or a comparison such as <2, <=2, >5, >=5, =3), found end of input\n  4d6r\n      ^\n"
    );
    assert_eq!(
        failure("4d6rr+3"),
        "error: expected a reroll condition (a number, or a comparison such as <2, <=2, >5, >=5, =3), found '+'\n  4d6rr+3\n       ^\n"
    );
    assert_eq!(
        failure("4d6r<"),
        "error: expected a number after the reroll condition, found end of input\n  4d6r<\n       ^\n"
    );
}

#[test]
fn reroll_clauses_out_of_order_or_repeated_are_parse_errors() {
    for formula in ["4d6!r1", "4d6dl1r1", "4d6r1r1", "4d6r1rr2", "4d6rrr1"] {
        let stderr = failure(formula);
        assert!(stderr.starts_with("error: "), "{formula}: {stderr}");
    }
}

#[test]
fn rerolls_happen_before_explosions_which_happen_before_keep_drop() {
    let cli = Cli::new();
    let (mut explosion_after_reroll, mut dropped_with_rerolls) = (0, 0);
    for seed in 0..200 {
        // Rerolls on 6 and explodes on 6: the standing die decides explosion.
        let pool = dice(&cli, "4d6r6!", seed);
        for (i, d) in pool.iter().enumerate() {
            if status(d) == "rerolled" {
                assert_eq!(value(d), 6);
                assert_ne!(status(&pool[i + 1]), "exploded", "{pool:?}");
                if value(&pool[i + 1]) == 6 {
                    // The second 6 stands and explodes.
                    assert_eq!(status(&pool[i + 2]), "exploded", "{pool:?}");
                    explosion_after_reroll += 1;
                }
            }
        }

        // Keep/drop sees only the standing pool (rerolled dice are never
        // dropped, nor counted as part of the pool).
        let out = cli.roll_json("4d6r1!dl1", seed);
        let pool = flat_dice(&out["rolls"][0]["expr"]);
        let standing: Vec<&Value> = pool.iter().filter(|d| status(d) != "rerolled").collect();
        let dropped: Vec<&&Value> = standing.iter().filter(|d| status(d) == "dropped").collect();
        assert_eq!(dropped.len(), 1, "{pool:?}");
        let lowest = standing.iter().map(|d| value(d)).min().unwrap();
        assert_eq!(value(dropped[0]), lowest, "{pool:?}");
        let counted: i64 = standing
            .iter()
            .filter(|d| status(d) != "dropped")
            .map(|d| value(d))
            .sum();
        assert_eq!(out["rolls"][0]["total"], counted, "{pool:?}");
        dropped_with_rerolls += usize::from(pool.iter().any(|d| status(d) == "rerolled"));
    }
    assert!(explosion_after_reroll > 0);
    assert!(dropped_with_rerolls > 0);
}

#[test]
fn keep_and_drop_counts_are_still_checked_against_the_dice_written() {
    // Rerolled-away dice are not extra dice in the pool.
    assert_eq!(
        failure("4d6r1dl4"),
        "error: cannot drop 4 dice from a pool of 4\n  4d6r1dl4\n       ^^^\n"
    );
    assert_eq!(
        failure("4d6rr<=2kh0"),
        "error: must keep between 1 and 3 dice from a pool of 4\n  4d6rr<=2kh0\n          ^^^\n"
    );
}

fn out(args: &[&str]) -> String {
    let run = Cli::new().run(args);
    run.assert_success();
    run.stdout
}

#[test]
fn default_output_marks_rerolled_away_dice_with_tildes() {
    // Seed 3 rerolls three 1s into 4, 6 and 5; the 4 is then dropped.
    assert_eq!(
        out(&["--seed", "3", "4d6r1dl1"]),
        "4d6r1dl1  [~1~, (4), ~1~, 6, ~1~, 5, 4]  →  15\n"
    );
}

#[test]
fn verbose_output_lists_rerolled_dice_with_their_status() {
    assert_eq!(
        out(&["--seed", "3", "-v", "4d6r1dl1"]),
        "4d6r1dl1\n  4d6r1dl1: 1 rerolled, 4 dropped, 1 rerolled, 6 kept, 1 rerolled, 5 kept, 4 kept = 15\n  total: 15\n"
    );
}

#[test]
fn color_dims_and_strikes_rerolled_dice() {
    let stdout = out(&["--seed", "3", "--color", "always", "4d6r1dl1"]);
    // Rerolled dice are dim and crossed out; dropped ones stay merely dim.
    assert!(stdout.contains("\x1b[2;9m~1~\x1b[0m"), "{stdout:?}");
    assert!(stdout.contains("\x1b[2m(4)\x1b[0m"), "{stdout:?}");
    let verbose = out(&["--seed", "3", "--color", "always", "-v", "4d6r1dl1"]);
    assert!(
        verbose.contains("\x1b[2;9m1 rerolled\x1b[0m"),
        "{verbose:?}"
    );
}

#[test]
fn a_natural_20_highlight_ignores_rerolled_away_dice() {
    // A lone d20 that rerolls: the highlight follows the die that stands.
    let cli = Cli::new();
    let mut checked = 0;
    for seed in 0..400 {
        let json = cli.roll_json("d20r<=10", seed);
        let pool = flat_dice(&json["rolls"][0]["expr"]);
        if pool.len() != 2 {
            continue;
        }
        let standing = value(&pool[1]);
        let seed = seed.to_string();
        let stdout = out(&["--seed", &seed, "--color", "always", "d20r<=10"]);
        let green = stdout.contains("\x1b[1;32m");
        let red = stdout.contains("\x1b[1;31m");
        assert_eq!(green, standing == 20, "seed {seed}: {stdout:?}");
        assert_eq!(red, standing == 1, "seed {seed}: {stdout:?}");
        checked += usize::from(standing == 20 || standing == 1);
    }
    assert!(checked > 0, "no seed ended on a natural");
}
