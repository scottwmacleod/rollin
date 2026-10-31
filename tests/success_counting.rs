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

#[test]
fn a_die_matching_both_clauses_is_a_success_only() {
    let cli = Cli::new();
    // Failure `>=3` overlaps success `>=5` on 5 and above.
    for seed in SEEDS {
        let out = cli.roll_json("8d6>=5f>=3", seed);
        let node = &out["rolls"][0]["expr"];
        let pool = flat_dice(node);
        let hits = pool.iter().filter(|d| value(d) >= 5).count() as i64;
        let misses = pool.iter().filter(|d| (3..5).contains(&value(d))).count() as i64;
        assert_eq!(node["successes"], hits, "seed {seed}");
        assert_eq!(node["failures"], misses, "seed {seed}");
        assert_eq!(out["rolls"][0]["total"], hits - misses, "seed {seed}");
    }
    // Even when every face matches both, the roll is legal: all successes.
    let out = cli.roll_json("4d6>=1f>=1", 1);
    assert_eq!(out["rolls"][0]["total"], 4);
    assert_eq!(out["rolls"][0]["expr"]["failures"], 0);
}

/// stderr of a failing run of `formula`.
fn failure(formula: &str) -> String {
    let run = Cli::new().run(&["--seed", "1", "--", formula]);
    assert!(!run.success(), "{formula} should be rejected: {run:?}");
    assert_eq!(run.stdout, "", "{formula}");
    run.stderr
}

const MESSAGE: &str = "a success count cannot be used in arithmetic; use it as a whole roll, or drop the success clause to sum the dice";

#[test]
fn a_success_count_in_arithmetic_is_a_typed_error_pointing_at_the_count() {
    // (formula, the count term the carets must underline)
    let cases = [
        ("6d10>=8 + 3", "6d10>=8"),
        ("3 + 6d10>=8", "6d10>=8"),
        ("-6d10>=8", "6d10>=8"),
        ("2*6d10>=8", "6d10>=8"),
        ("(6d10>=8)+1", "(6d10>=8)"),
        ("6d10>=8 + 6d10>=8", "6d10>=8"),
        ("1 - 4d6dl1>5f1", "4d6dl1>5f1"),
        ("d20 + (6d10=10) / 2", "(6d10=10)"),
    ];
    for (formula, term) in cases {
        let start = formula.find(term).unwrap();
        let expected = format!(
            "error: {MESSAGE}\n  {formula}\n  {}{}\n",
            " ".repeat(start),
            "^".repeat(term.len())
        );
        assert_eq!(failure(formula), expected, "{formula}");
    }
}

#[test]
fn a_lone_or_parenthesised_success_count_and_comma_lists_are_fine() {
    let cli = Cli::new();
    for formula in ["6d10>=8", "(6d10>=8)", "((6d10>=8))", "+6d10>=8"] {
        let out = cli.roll_json(formula, 4);
        assert_eq!(out["rolls"][0]["kind"], "count", "{formula}");
    }
    let out = cli.roll_json("6d10>=8, d20, 4d6>3f1", 4);
    let kinds: Vec<&Value> = out["rolls"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| &r["kind"])
        .collect();
    assert_eq!(
        kinds,
        [&Value::from("count"), &Value::Null, &Value::from("count")]
    );
    // A sum next to a count in the list still sums.
    assert_eq!(out["rolls"][1]["expr"]["type"], "dice");
}

/// stdout of `rollin <args...> <formula>` with the given seed.
fn human(args: &[&str], formula: &str, seed: u64) -> String {
    let seed = seed.to_string();
    let mut all = vec!["--seed", &seed];
    all.extend_from_slice(args);
    all.extend(["--", formula]);
    let run = Cli::new().run(&all);
    run.assert_success();
    run.stdout
}

/// The default line's dice cells: `✓` marks a success, `✗` a failure.
fn cells(pool: &[Value]) -> String {
    let cells: Vec<String> = pool
        .iter()
        .map(|d| match d.get("outcome").and_then(Value::as_str) {
            Some("success") => format!("{}✓", value(d)),
            Some("failure") => format!("{}✗", value(d)),
            _ => value(d).to_string(),
        })
        .collect();
    format!("[{}]", cells.join(", "))
}

#[test]
fn default_output_marks_outcomes_and_labels_the_count() {
    let cli = Cli::new();
    // Pinned: one concrete seed, written out by hand.
    let out = cli.roll_json("6d10>=8", 6);
    let pool = flat_dice(&out["rolls"][0]["expr"]);
    assert_eq!(
        human(&[], "6d10>=8", 6),
        format!(
            "6d10>=8  {}  →  {}\n",
            cells(&pool),
            label(out["rolls"][0]["total"].as_i64().unwrap(), None)
        )
    );
    let mut seen = [false; 3]; // singular, plural, failures breakdown
    for seed in SEEDS {
        for formula in ["6d10>=8", "6d10>=8f1"] {
            let out = cli.roll_json(formula, seed);
            let node = &out["rolls"][0]["expr"];
            let pool = flat_dice(node);
            let (s, f) = (
                node["successes"].as_i64().unwrap(),
                node["failures"].as_i64().unwrap(),
            );
            let total = s - f;
            let tail = label(total, (f > 0).then_some((s, f)));
            seen[0] |= tail.starts_with("1 success") && !tail.starts_with("1 successes");
            seen[1] |= tail.starts_with("3 successes");
            seen[2] |= f > 0 && tail.contains('(');
            assert_eq!(
                human(&[], formula, seed),
                format!("{formula}  {}  →  {tail}\n", cells(&pool)),
                "{formula} seed {seed}"
            );
        }
    }
    assert_eq!(seen, [true; 3]);
}

/// The documented total label: `3 successes`, `1 success`, and with failures
/// `2 successes (3 - 1 failure)`.
fn label(total: i64, tally: Option<(i64, i64)>) -> String {
    let noun = if total.abs() == 1 {
        "success"
    } else {
        "successes"
    };
    match tally {
        None => format!("{total} {noun}"),
        Some((s, f)) => {
            let fail_noun = if f == 1 { "failure" } else { "failures" };
            format!("{total} {noun} ({s} - {f} {fail_noun})")
        }
    }
}

#[test]
fn color_paints_successes_green_and_failures_red_only_when_on() {
    let cli = Cli::new();
    let (mut greens, mut reds) = (0, 0);
    for seed in SEEDS {
        let out = cli.roll_json("6d10>=8f1", seed);
        let node = &out["rolls"][0]["expr"];
        let pool = flat_dice(node);
        let colored = human(&["--color", "always"], "6d10>=8f1", seed);
        let cells: Vec<String> = pool
            .iter()
            .map(|d| match d.get("outcome").and_then(Value::as_str) {
                Some("success") => {
                    greens += 1;
                    format!("\x1b[32m{}✓\x1b[0m", value(d))
                }
                Some("failure") => {
                    reds += 1;
                    format!("\x1b[31m{}✗\x1b[0m", value(d))
                }
                _ => value(d).to_string(),
            })
            .collect();
        let (s, f) = (
            node["successes"].as_i64().unwrap(),
            node["failures"].as_i64().unwrap(),
        );
        let tail = label(s - f, (f > 0).then_some((s, f)));
        assert_eq!(
            colored,
            format!(
                "6d10>=8f1  [{}]  →  \x1b[1m{tail}\x1b[0m\n",
                cells.join(", ")
            ),
            "seed {seed}"
        );
        // Off: no escape codes at all.
        let plain = human(&["--color", "never"], "6d10>=8f1", seed);
        assert!(!plain.contains('\x1b'), "{plain}");
    }
    assert!(greens > 0 && reds > 0, "greens {greens}, reds {reds}");
}

#[test]
fn a_natural_twenty_or_one_on_a_counting_d20_is_painted_by_outcome_not_bold() {
    let cli = Cli::new();
    let mut checked = 0;
    for seed in 0..200 {
        let out = cli.roll_json("d20>=15f1", seed);
        let v = value(&flat_dice(&out["rolls"][0]["expr"])[0]);
        if v != 20 && v != 1 {
            continue;
        }
        let colored = human(&["--color", "always"], "d20>=15f1", seed);
        let (code, mark) = if v == 20 {
            ("32", "✓")
        } else {
            ("31", "✗")
        };
        assert!(
            colored.contains(&format!("[\x1b[{code}m{v}{mark}\x1b[0m]")),
            "{colored}"
        );
        checked += 1;
    }
    assert!(checked >= 2, "only {checked} naturals in 200 seeds");
}

#[test]
fn verbose_shows_per_die_outcomes_and_the_tally_breakdown() {
    let cli = Cli::new();
    for seed in SEEDS {
        let out = cli.roll_json("6d10>=8f1", seed);
        let node = &out["rolls"][0]["expr"];
        let cells: Vec<String> = flat_dice(node)
            .iter()
            .map(|d| match d.get("outcome").and_then(Value::as_str) {
                Some(o) => format!("{} kept {o}", value(d)),
                None => format!("{} kept", value(d)),
            })
            .collect();
        let (s, f) = (
            node["successes"].as_i64().unwrap(),
            node["failures"].as_i64().unwrap(),
        );
        let tail = label(s - f, (f > 0).then_some((s, f)));
        assert_eq!(
            human(&["-v"], "6d10>=8f1", seed),
            format!(
                "6d10>=8f1\n  6d10>=8f1: {} = {}\n    successes: {s}, failures: {f}, net: {}\n  total: {tail}\n",
                cells.join(", "),
                s - f,
                s - f
            ),
            "seed {seed}"
        );
    }
}

#[test]
fn verbose_sum_rolls_are_unchanged() {
    let out = human(&["-v"], "2d6+3", 4);
    assert!(!out.contains("successes"), "{out}");
    assert!(out.ends_with(&format!("  total: {}\n", {
        let j = Cli::new().roll_json("2d6+3", 4);
        j["rolls"][0]["total"].as_i64().unwrap()
    })));
}

#[test]
fn quiet_prints_the_plain_net_number() {
    let cli = Cli::new();
    for seed in 0..10 {
        let out = cli.roll_json("6d10>=8f1", seed);
        let run = cli.run(&["-q", "--seed", &seed.to_string(), "6d10>=8f1, d20"]);
        run.assert_success();
        let expected = format!(
            "{}\n{}\n",
            out["rolls"][0]["total"],
            cli.roll_json("6d10>=8f1, d20", seed)["rolls"][1]["total"]
        );
        assert_eq!(run.stdout, expected);
    }
}

#[test]
fn every_comparison_operator_counts_correctly() {
    let cli = Cli::new();
    type Case = (&'static str, fn(i64) -> bool);
    let cases: [Case; 6] = [
        ("6d10>=8", |v| v >= 8),
        ("6d10>7", |v| v > 7),
        ("6d10<=3", |v| v <= 3),
        ("6d10<3", |v| v < 3),
        ("10d10=10", |v| v == 10),
        ("6D10 >= 8", |v| v >= 8),
    ];
    for (formula, wins) in cases {
        let mut nonzero = false;
        for seed in SEEDS {
            let out = cli.roll_json(formula, seed);
            let hits = flat_dice(&out["rolls"][0]["expr"])
                .iter()
                .filter(|d| wins(value(d)))
                .count() as i64;
            assert_eq!(out["rolls"][0]["total"], hits, "{formula} seed {seed}");
            nonzero |= hits > 0;
        }
        assert!(nonzero, "{formula}: never a success");
    }
}

#[test]
fn trivial_and_impossible_conditions_are_legal() {
    let cli = Cli::new();
    assert_eq!(cli.roll_json("5d6>=1", 2)["rolls"][0]["total"], 5);
    assert_eq!(cli.roll_json("5d6>6", 2)["rolls"][0]["total"], 0);
    assert_eq!(cli.roll_json("5d6<1", 2)["rolls"][0]["total"], 0);
}

#[test]
fn dropped_and_rerolled_away_dice_never_count() {
    let cli = Cli::new();
    let (mut dropped_matched, mut rerolled_matched) = (false, false);
    for seed in SEEDS {
        // Keep/drop first, then the count: a dropped 6 is not a success.
        let out = cli.roll_json("4d6dh1>=5", seed);
        let pool = flat_dice(&out["rolls"][0]["expr"]);
        let hits = pool
            .iter()
            .filter(|d| status(d) == "kept" && value(d) >= 5)
            .count() as i64;
        assert_eq!(out["rolls"][0]["total"], hits, "seed {seed}: {pool:?}");
        for d in pool.iter().filter(|d| status(d) == "dropped") {
            assert!(d.get("outcome").is_none(), "{pool:?}");
            dropped_matched |= value(d) >= 5;
        }
        // Reroll first: the rerolled-away 1 would be a failure but is history.
        let out = cli.roll_json("6d10r<=2>=8f<=3", seed);
        let pool = flat_dice(&out["rolls"][0]["expr"]);
        let node = &out["rolls"][0]["expr"];
        for d in pool.iter().filter(|d| status(d) == "rerolled") {
            assert!(d.get("outcome").is_none(), "{pool:?}");
            rerolled_matched |= value(d) <= 3;
        }
        let standing: Vec<&Value> = pool.iter().filter(|d| status(d) != "rerolled").collect();
        let s = standing.iter().filter(|d| value(d) >= 8).count() as i64;
        let f = standing
            .iter()
            .filter(|d| value(d) < 8 && value(d) <= 3)
            .count() as i64;
        assert_eq!(
            (
                node["successes"].as_i64().unwrap(),
                node["failures"].as_i64().unwrap()
            ),
            (s, f)
        );
    }
    assert!(dropped_matched && rerolled_matched);
}

#[test]
fn exploded_dice_count_and_explode_then_success_parse_by_a_fixed_rule() {
    let cli = Cli::new();
    // `!` takes the comparison right after it as its explode condition, so
    // `8d10!>=8` explodes on 8+ and is a plain sum; a success clause follows
    // the explode condition: `8d10!>=8>=8`.
    let out = cli.roll_json("8d10!>=8", 5);
    assert!(out["rolls"][0].get("kind").is_none(), "{out}");
    let mut exploded_hit = false;
    for seed in SEEDS {
        for formula in [
            "8d10!>=8>=8",
            "4d6!>5>=6",
            "4d6!!>5>=6",
            "4d6!p>5>=5",
            "4d6!=6>5",
            "4d6! =6 >5",
        ] {
            let out = cli.roll_json(formula, seed);
            let roll = &out["rolls"][0];
            assert_eq!(roll["kind"], "count", "{formula}");
            let (cmp, v) = match formula {
                "8d10!>=8>=8" => (0, 8),
                "4d6!>5>=6" | "4d6!!>5>=6" => (0, 6),
                "4d6!p>5>=5" => (0, 5),
                _ => (1, 5),
            };
            let hits = flat_dice(&roll["expr"])
                .iter()
                .filter(|d| {
                    status(d) != "dropped"
                        && if cmp == 0 {
                            value(d) >= v
                        } else {
                            value(d) > v
                        }
                })
                .count() as i64;
            assert_eq!(roll["total"], hits, "{formula} seed {seed}");
            exploded_hit |= flat_dice(&roll["expr"])
                .iter()
                .any(|d| status(d) == "exploded" && d.get("outcome").is_some());
        }
    }
    assert!(exploded_hit, "no exploded die ever scored");
}

#[test]
fn all_modifiers_apply_in_order_reroll_explode_keep_then_count() {
    let cli = Cli::new();
    let mut scored_exploded = false;
    for seed in SEEDS {
        let out = cli.roll_json("6d6r1!kh4>=5f<=2", seed);
        let node = &out["rolls"][0]["expr"];
        let pool = flat_dice(node);
        let counting: Vec<&Value> = pool
            .iter()
            .filter(|d| matches!(status(d), "kept" | "exploded"))
            .collect();
        assert_eq!(counting.len(), 4, "seed {seed}: {pool:?}");
        let s = counting.iter().filter(|d| value(d) >= 5).count() as i64;
        let f = counting.iter().filter(|d| value(d) <= 2).count() as i64;
        assert_eq!(node["successes"], s);
        assert_eq!(node["failures"], f);
        assert_eq!(out["rolls"][0]["total"], s - f);
        scored_exploded |= pool
            .iter()
            .any(|d| status(d) == "exploded" && d.get("outcome").is_some());
    }
    assert!(scored_exploded);
}

#[test]
fn malformed_success_and_failure_clauses_are_syntax_errors_with_spans() {
    let cases = [
        (
            "6d10f1",
            "error: a failure clause 'f' must follow a success clause, as in 6d10>=8f1\n  6d10f1\n      ^\n",
        ),
        (
            "6d10>=8f",
            "error: expected a failure condition (a number, or a comparison such as <=2, >9, =1), found end of input\n  6d10>=8f\n          ^\n",
        ),
        (
            "6d10>=",
            "error: expected a number after the success condition, found end of input\n  6d10>=\n        ^\n",
        ),
        (
            "6d10>=8>=9",
            "error: expected ',' or the end of the formula, found '>='\n  6d10>=8>=9\n         ^^\n",
        ),
        (
            "6d10>=8f1f2",
            "error: expected ',' or the end of the formula, found 'f'\n  6d10>=8f1f2\n           ^\n",
        ),
    ];
    for (formula, expected) in cases {
        assert_eq!(failure(formula), expected, "{formula}");
    }
}

#[test]
fn v1_formulas_do_not_pick_up_counts() {
    let cli = Cli::new();
    for seed in 0..10 {
        for formula in ["4d6dl1", "d20+5", "2d6+3", "3d6!", "4d6r1"] {
            let out = cli.roll_json(formula, seed);
            assert!(out["rolls"][0].get("kind").is_none(), "{formula}");
        }
    }
}
