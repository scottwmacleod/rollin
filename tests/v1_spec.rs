//! The Python v1 test suite, extracted as a data-driven parity spec.
//!
//! Cases live in `tests/fixtures/v1_spec.toml`. Each case is run through the
//! CLI seam (`rollin <formula> --seed N --json`) and its observable behaviour
//! is checked. Cases the engine cannot do yet carry `status = "ignored"` and a
//! `reason` naming the ticket that un-ignores them. Ignored cases are skipped
//! but counted; every other case must pass.

mod common;

use common::{flat_dice, Cli};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct Spec {
    case: Vec<Case>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Case {
    name: String,
    /// The Python test this case came from (`file::test`).
    source: String,
    /// `roll` (default): run a formula. `presets`: preset-store behaviour.
    #[serde(default = "default_kind")]
    kind: String,
    /// Prose description of behaviour for kinds without a formula.
    behaviour: Option<String>,
    #[serde(default)]
    formula: String,
    /// `live` or `ignored`.
    status: String,
    /// Required when ignored; must name a ticket like `#10`.
    reason: Option<String>,

    // Observable expectations. `expect = "ok"` unless stated.
    #[serde(default = "default_expect")]
    expect: String,
    /// Number of rolls in the output (comma-separated formulas).
    rolls: Option<usize>,
    /// Inclusive [min, max] total for each roll, in order.
    total_ranges: Option<Vec<[i64; 2]>>,
    // The remaining fields check the first roll.
    dice: Option<usize>,
    kept: Option<usize>,
    dropped: Option<usize>,
    total_min: Option<i64>,
    total_max: Option<i64>,
    /// When set, total must equal (sum of kept dice) + this modifier.
    modifier: Option<i64>,
    /// `lowest` / `highest`: every dropped die is at the extreme of the pool.
    dropped_extreme: Option<String>,
}

fn default_kind() -> String {
    "roll".into()
}
fn default_expect() -> String {
    "ok".into()
}

const SEED: &str = "1";

fn check(cli: &Cli, c: &Case) -> Result<(), String> {
    if c.kind != "roll" {
        return Err(format!("no runner for kind {:?}", c.kind));
    }
    let run = cli.run(&[&c.formula, "--seed", SEED, "--json"]);
    if c.expect == "error" {
        return if run.success() {
            Err(format!("expected an error, got success: {}", run.stdout))
        } else {
            Ok(())
        };
    }
    if !run.success() {
        return Err(format!("expected success, got {run:?}"));
    }
    let out: Value = serde_json::from_str(&run.stdout).map_err(|e| format!("bad JSON: {e}"))?;
    let rolls = out["rolls"].as_array().ok_or("missing rolls array")?;
    if let Some(n) = c.rolls {
        eq("rolls", rolls.len(), n)?;
    }
    if let Some(ranges) = &c.total_ranges {
        eq("rolls", rolls.len(), ranges.len())?;
        for (i, (r, [lo, hi])) in rolls.iter().zip(ranges).enumerate() {
            let t = r["total"].as_i64().ok_or("total not an integer")?;
            if !(*lo..=*hi).contains(&t) {
                return Err(format!("roll {i}: total {t} not in {lo}..={hi}"));
            }
        }
    }
    let first = rolls.first().ok_or("no rolls")?;
    let dice = flat_dice(&first["expr"]);
    let total = first["total"].as_i64().ok_or("total not an integer")?;
    let with = |status: &str| -> Vec<i64> {
        dice.iter()
            .filter(|d| d["status"] == status)
            .map(|d| d["value"].as_i64().unwrap())
            .collect()
    };
    let (kept, dropped) = (with("kept"), with("dropped"));
    if let Some(n) = c.dice {
        eq("dice", dice.len(), n)?;
    }
    if let Some(n) = c.kept {
        eq("kept", kept.len(), n)?;
    }
    if let Some(n) = c.dropped {
        eq("dropped", dropped.len(), n)?;
    }
    if let Some(min) = c.total_min {
        if total < min {
            return Err(format!("total {total} < {min}"));
        }
    }
    if let Some(max) = c.total_max {
        if total > max {
            return Err(format!("total {total} > {max}"));
        }
    }
    if let Some(m) = c.modifier {
        eq("total", total, kept.iter().sum::<i64>() + m)?;
    }
    match c.dropped_extreme.as_deref() {
        None => {}
        Some("lowest") => {
            let floor = *kept.iter().min().ok_or("no kept dice")?;
            if dropped.iter().any(|&d| d > floor) {
                return Err(format!("dropped {dropped:?} not below kept {kept:?}"));
            }
        }
        Some("highest") => {
            let ceil = *kept.iter().max().ok_or("no kept dice")?;
            if dropped.iter().any(|&d| d < ceil) {
                return Err(format!("dropped {dropped:?} not above kept {kept:?}"));
            }
        }
        Some(other) => return Err(format!("unknown dropped_extreme {other:?}")),
    }
    Ok(())
}

fn eq<T: PartialEq + std::fmt::Debug>(what: &str, actual: T, expected: T) -> Result<(), String> {
    if actual == expected {
        Ok(())
    } else {
        Err(format!("{what}: expected {expected:?}, got {actual:?}"))
    }
}

#[test]
fn v1_spec_cases() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/v1_spec.toml");
    let raw = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    let spec: Spec = toml::from_str(&raw).expect("parse v1_spec.toml");
    assert!(!spec.case.is_empty(), "v1 spec table is empty");

    let cli = Cli::new();
    let (mut live, mut ignored) = (0, 0);
    let mut failures = Vec::new();
    for c in &spec.case {
        match c.status.as_str() {
            "ignored" => {
                ignored += 1;
                let has_ticket = c.reason.as_deref().is_some_and(|r| {
                    r.split('#')
                        .skip(1)
                        .any(|t| t.starts_with(|ch: char| ch.is_ascii_digit()))
                });
                if !has_ticket {
                    failures.push(format!("{}: ignored without a #ticket reason", c.name));
                }
            }
            "live" => {
                live += 1;
                if let Err(e) = check(&cli, c) {
                    let what = c.behaviour.as_deref().unwrap_or(&c.formula);
                    failures.push(format!("{} ({}) [{what}]: {e}", c.name, c.source));
                }
            }
            other => failures.push(format!("{}: unknown status {other:?}", c.name)),
        }
    }
    println!("v1 spec: {live} live, {ignored} ignored");
    assert!(
        failures.is_empty(),
        "{} v1 spec failures ({live} live, {ignored} ignored):\n{}",
        failures.len(),
        failures.join("\n")
    );
}
