//! Percentile (`d%`) and fudge (`dF`) dice at the CLI seam.

mod common;

use common::{flat_dice, Cli};
use serde_json::Value;

/// A roll's tree with the text and die-type marker that legitimately differ
/// between spellings removed.
fn without_text(node: &Value) -> Value {
    match node {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(k, _)| !matches!(k.as_str(), "formula" | "term" | "special"))
                .map(|(k, v)| (k.clone(), without_text(v)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(without_text).collect()),
        other => other.clone(),
    }
}

#[test]
fn percentile_is_a_d100_under_the_same_seed() {
    let cli = Cli::new();
    for seed in 0..40 {
        for (pct, d100) in [
            ("d%", "d100"),
            ("1d%", "1d100"),
            ("2d%", "2d100"),
            ("3D%dl1", "3d100dl1"),
            ("d%+d6, d%", "d100+d6, d100"),
            ("4d%>=90", "4d100>=90"),
            ("d%!", "d100!"),
        ] {
            assert_eq!(
                without_text(&cli.roll_json(pct, seed)),
                without_text(&cli.roll_json(d100, seed)),
                "{pct} vs {d100}, seed {seed}"
            );
        }
    }
}

#[test]
fn percentile_dice_roll_one_to_one_hundred() {
    let cli = Cli::new();
    let mut seen = std::collections::BTreeSet::new();
    for seed in 0..100 {
        for d in flat_dice(&cli.roll_json("5d%", seed)["rolls"][0]["expr"]) {
            let v = d["value"].as_i64().unwrap();
            assert!((1..=100).contains(&v), "seed {seed}: {v}");
            seen.insert(v);
        }
    }
    assert!(
        seen.len() > 50,
        "suspiciously few distinct values: {}",
        seen.len()
    );
}

#[test]
fn percentile_works_with_advantage_like_any_single_die() {
    let cli = Cli::new();
    for seed in 0..20 {
        assert_eq!(
            without_text(&cli.roll_json("d%adv", seed)),
            without_text(&cli.roll_json("2d100kh1", seed)),
            "seed {seed}"
        );
    }
}

#[test]
fn json_marks_percentile_groups_and_echoes_the_term_as_typed() {
    let out = Cli::new().roll_json("2D%", 3);
    let node = &out["rolls"][0]["expr"];
    assert_eq!(node["term"], "2D%");
    assert_eq!(node["sides"], 100);
    assert_eq!(node["special"], "percentile");
    let ordinary = Cli::new().roll_json("2d100", 3);
    assert!(ordinary["rolls"][0]["expr"].get("special").is_none());
    assert_eq!(out["schema_version"], 1);
}

#[test]
fn default_and_verbose_output_echo_percentile_as_typed() {
    let cli = Cli::new();
    let run = cli.run(&["--seed", "99", "2d%"]);
    run.assert_success();
    assert!(run.stdout.starts_with("2d%  ["), "{}", run.stdout);
    let run = cli.run(&["--seed", "99", "-v", "d%"]);
    run.assert_success();
    assert!(run.stdout.contains("d%: "), "{}", run.stdout);
}

fn values(cli: &Cli, formula: &str, seed: u64) -> Vec<i64> {
    flat_dice(&cli.roll_json(formula, seed)["rolls"][0]["expr"])
        .iter()
        .map(|d| d["value"].as_i64().unwrap())
        .collect()
}

#[test]
fn a_fudge_die_is_one_uniform_draw_among_minus_one_zero_and_plus_one() {
    // Documented RNG use: each die is the same single draw as a d3, minus 2,
    // so the faces 1, 2, 3 read -1, 0, +1.
    let cli = Cli::new();
    let mut seen = std::collections::BTreeSet::new();
    for seed in 0..60 {
        for spelling in ["4dF", "4df", "4DF"] {
            let fudge = values(&cli, spelling, seed);
            let d3: Vec<i64> = values(&cli, "4d3", seed).iter().map(|v| v - 2).collect();
            assert_eq!(fudge, d3, "{spelling}, seed {seed}");
            seen.extend(fudge);
        }
    }
    assert_eq!(seen.into_iter().collect::<Vec<_>>(), vec![-1, 0, 1]);
}

#[test]
fn json_marks_fudge_groups_and_totals_them() {
    let cli = Cli::new();
    for seed in 0..30 {
        let out = cli.roll_json("1dF", seed);
        let node = &out["rolls"][0]["expr"];
        assert_eq!(node["special"], "fudge");
        assert_eq!(node["term"], "1dF");
        assert_eq!(node["sides"], 3);
        let sum: i64 = values(&cli, "4dF", seed).iter().sum();
        assert_eq!(cli.roll_json("4dF", seed)["rolls"][0]["total"], sum);
    }
}

#[test]
fn default_output_draws_fudge_dice_as_plus_zero_and_minus_and_verbose_as_numbers() {
    let cli = Cli::new();
    let mut seen = std::collections::BTreeSet::new();
    for seed in 0..40 {
        let faces = values(&cli, "4dF", seed);
        let glyphs: Vec<&str> = faces
            .iter()
            .map(|v| match v {
                -1 => "-",
                0 => "0",
                _ => "+",
            })
            .collect();
        let total: i64 = faces.iter().sum();
        let run = cli.run(&["--seed", &seed.to_string(), "4dF"]);
        run.assert_success();
        assert_eq!(
            run.stdout,
            format!("4dF  [{}]  →  {total}\n", glyphs.join(", ")),
            "seed {seed}"
        );
        let verbose = cli.run(&["--seed", &seed.to_string(), "-v", "4dF"]);
        let cells: Vec<String> = faces.iter().map(|v| format!("{v} kept")).collect();
        assert!(
            verbose
                .stdout
                .contains(&format!("4dF: {} = {total}", cells.join(", "))),
            "seed {seed}: {}",
            verbose.stdout
        );
        seen.extend(glyphs.iter().map(|g| g.to_string()));
    }
    assert_eq!(seen.len(), 3, "{seen:?}");
}

#[test]
fn fudge_dice_support_keep_drop_and_advantage() {
    let cli = Cli::new();
    for seed in 0..30 {
        let same = |a: &str, b: &str, shift: i64| {
            let fudge = values(&cli, a, seed);
            let d3: Vec<i64> = values(&cli, b, seed).iter().map(|v| v - shift).collect();
            assert_eq!(fudge, d3, "{a} vs {b}, seed {seed}");
        };
        same("4dFdl1", "4d3dl1", 2);
        same("4DFKH2", "4d3kh2", 2);
        same("dFadv", "2d3kh1", 2);
        same("dfdis", "2d3kl1", 2);
        let out = cli.roll_json("4dFdl1", seed);
        let total: i64 = flat_dice(&out["rolls"][0]["expr"])
            .iter()
            .filter(|d| d["status"] == "kept")
            .map(|d| d["value"].as_i64().unwrap())
            .sum();
        assert_eq!(out["rolls"][0]["total"], total, "seed {seed}");
    }
}

#[test]
fn reroll_explode_and_success_clauses_on_fudge_dice_are_typed_errors() {
    // (formula, byte column of the clause, width)
    let cases = [
        ("4dFr1", "reroll", 3, 1),
        ("4dF rr0", "reroll", 4, 2),
        ("4dF!", "explode", 3, 1),
        ("4dF!!", "explode", 3, 1),
        ("4dF>=1", "success", 3, 2),
        ("4dFdl1=1", "success", 6, 1),
        ("dFadv>0", "success", 5, 1),
    ];
    for (formula, what, col, width) in cases {
        let run = Cli::new().run(&["--seed", "1", "--", formula]);
        assert!(
            !run.success() && run.stdout.is_empty(),
            "{formula}: {run:?}"
        );
        assert_eq!(
            run.stderr,
            format!(
                "error: {what} clauses are not supported on fudge dice\n  {formula}\n  {}{}\n",
                " ".repeat(col),
                "^".repeat(width)
            ),
            "{formula}"
        );
    }
}

#[track_caller]
fn stderr_of(formula: &str) -> String {
    let run = Cli::new().run(&["--seed", "1", "--", formula]);
    assert!(
        !run.success() && run.stdout.is_empty(),
        "{formula}: {run:?}"
    );
    run.stderr
}

#[test]
fn fudge_dice_count_toward_the_dice_caps() {
    assert_eq!(
        stderr_of("1001dF"),
        "error: dice per term cap (1000) exceeded by '1001dF'\n  1001dF\n  ^^^^\n"
    );
    Cli::new().run(&["--seed", "1", "1000dF"]).assert_success();
    let eleven = ["1000dF"; 11].join("+");
    let err = stderr_of(&eleven);
    assert!(
        err.starts_with("error: dice per expression cap (10000) exceeded by '1000dF'"),
        "{err}"
    );
    let ten = ["1000dF"; 10].join("+");
    Cli::new().run(&["--seed", "1", &ten]).assert_success();
}

#[test]
fn ordinary_dice_keep_their_sides_validation() {
    for formula in ["d1", "d0", "d10001", "2d1"] {
        assert!(
            stderr_of(formula).starts_with("error: sides must be between 2 and 10000"),
            "{formula}"
        );
    }
    Cli::new()
        .run(&["--seed", "1", "d2+d10000"])
        .assert_success();
}

#[test]
fn failure_clauses_and_fudge_words_still_lex_apart() {
    let cli = Cli::new();
    for formula in ["6d10>=8f1", "6D10>=8F1", "6d10>=8 f1", "6d10>7f<=2"] {
        cli.run(&["--seed", "2", "--", formula]).assert_success();
    }
    let out = cli.roll_json("6d10>=8f1", 2);
    assert_eq!(out["rolls"][0]["kind"], "count");
    assert_eq!(out["rolls"][0]["expr"]["failures"], 1);
    // `f` after a fudge group is still just a failure clause with nothing to
    // follow, not part of the fudge word.
    assert!(stderr_of("4dFf1").starts_with("error: a failure clause 'f' must follow"));
}

#[test]
fn fudge_works_in_arithmetic_and_with_other_terms() {
    let cli = Cli::new();
    for seed in 0..20 {
        let faces: i64 = values(&cli, "4dF", seed).iter().sum();
        let out = cli.roll_json("4dF+3", seed);
        assert_eq!(out["rolls"][0]["total"], faces + 3, "seed {seed}");
        let out = cli.roll_json("4dF-5", seed);
        assert_eq!(out["rolls"][0]["total"], faces - 5, "seed {seed}");
    }
}
