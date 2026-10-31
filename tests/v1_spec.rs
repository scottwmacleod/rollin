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
    match c.kind.as_str() {
        "roll" => check_roll(cli, c),
        // Each presets case gets its own empty config dir.
        "presets" => check_presets(&Cli::new(), c),
        other => Err(format!("no runner for kind {other:?}")),
    }
}

/// Runs `args` and fails unless it exited 0.
fn ok(cli: &Cli, args: &[&str]) -> Result<common::Run, String> {
    let run = cli.run(args);
    if run.success() {
        Ok(run)
    } else {
        Err(format!("{args:?} should succeed, got {run:?}"))
    }
}

/// Runs `args` and fails unless it is a clean error (exit 1, message on
/// stderr, nothing on stdout) containing `needle`.
fn clean_error(cli: &Cli, args: &[&str], needle: &str) -> Result<(), String> {
    let run = cli.run(args);
    if run.code != 1 || !run.stdout.is_empty() || run.stderr.contains("panicked") {
        return Err(format!("{args:?} should be a clean error, got {run:?}"));
    }
    if !run.stderr.starts_with("error: ") || !run.stderr.contains(needle) {
        return Err(format!("{args:?}: stderr lacks {needle:?}: {run:?}"));
    }
    Ok(())
}

/// Writes the presets file by hand (for the corrupt-store cases) and returns
/// its text, to check it is never rewritten.
fn hand_written_store(cli: &Cli, contents: &str) -> String {
    let dir = cli.config_dir().join("rollin");
    std::fs::create_dir_all(&dir).expect("create config dir");
    std::fs::write(dir.join("presets.toml"), contents).expect("write store");
    contents.to_string()
}

fn store_text(cli: &Cli) -> String {
    std::fs::read_to_string(cli.config_dir().join("rollin/presets.toml")).expect("read store")
}

/// The v1 preset-store tests, driven through the CLI against the TOML store.
/// Three cases adapt v1 on purpose (ADR 0004 moves storage to TOML and the
/// v2 spec makes a bad store a clear error instead of silently empty).
fn check_presets(cli: &Cli, c: &Case) -> Result<(), String> {
    match c.name.as_str() {
        "presets_load_missing_file" => {
            let run = ok(cli, &["presets"])?;
            eq("listing", run.stdout.starts_with("No presets saved."), true)
        }
        "presets_save_and_load_roundtrip" => {
            ok(cli, &["save", "--global", "attack", "d20+5"])?;
            eq(
                "listing",
                ok(cli, &["presets"])?.stdout,
                "attack  d20+5\n".into(),
            )
        }
        "presets_add_and_get_preset" => {
            ok(cli, &["save", "--global", "Attack", "d20+5"])?;
            let run = ok(cli, &["attack", "--seed", SEED, "--json"])?;
            eq(
                "formula",
                run.json()["rolls"][0]["formula"].clone(),
                "d20+5".into(),
            )
        }
        "presets_get_preset_case_insensitive" => {
            ok(cli, &["save", "--global", "MyRoll", "d20"])?;
            ok(cli, &["myroll", "--seed", SEED])?;
            ok(cli, &["MYROLL", "--seed", SEED]).map(|_| ())
        }
        "presets_delete_preset" => {
            ok(cli, &["save", "--global", "gone", "d6"])?;
            ok(cli, &["delete", "gone"])?;
            clean_error(cli, &["gone"], "'gone'")?;
            eq(
                "listing",
                ok(cli, &["presets"])?.stdout.starts_with("No presets"),
                true,
            )
        }
        "presets_delete_nonexistent_preset" => {
            clean_error(cli, &["delete", "ghost"], "no preset named 'ghost'")
        }
        // v1 loaded a corrupt file as empty (and the next save overwrote it).
        // v2 reports the file and leaves it alone.
        "presets_load_corrupted_json" => {
            let text = hand_written_store(cli, "[presets\nbroken = = 1\n");
            clean_error(cli, &["presets"], "presets.toml: not valid TOML")?;
            clean_error(cli, &["save", "--global", "x", "d6"], "not valid TOML")?;
            eq("file", store_text(cli), text)
        }
        // v1: a JSON list loaded as empty. v2: a `presets` value of the
        // wrong shape is an error.
        "presets_load_non_dict_json" => {
            let text = hand_written_store(cli, "presets = [\"d20\"]\n");
            clean_error(cli, &["presets"], "`presets` must be a table")?;
            eq("file", store_text(cli), text)
        }
        // v1 dropped non-string values on load. v2 refuses the file and names
        // the entry (`import` still drops them, with a reason per entry).
        "presets_load_filters_non_string_values" => {
            let text = hand_written_store(cli, "[presets]\ngood = \"d6\"\nbad = 5\n");
            clean_error(cli, &["presets"], "preset 'bad' must be a string")?;
            eq("file", store_text(cli), text)
        }
        "presets_multiple_presets" => {
            let all = [("first", "d4"), ("second", "2d6+1"), ("third", "4d6dl1")];
            for (name, formula) in all {
                ok(cli, &["save", "--global", name, formula])?;
            }
            let listing = ok(cli, &["presets"])?.stdout;
            for (name, formula) in all {
                let line = listing
                    .lines()
                    .find(|l| l.starts_with(name))
                    .ok_or(format!("{name} not listed"))?;
                eq("line", line.ends_with(formula), true)?;
                let run = ok(cli, &[name, "--seed", SEED, "--json"])?;
                eq(
                    "formula",
                    run.json()["rolls"][0]["formula"].clone(),
                    formula.into(),
                )?;
            }
            Ok(())
        }
        other => Err(format!("no runner for presets case {other:?}")),
    }
}

fn check_roll(cli: &Cli, c: &Case) -> Result<(), String> {
    let run = cli.run(&[&c.formula, "--seed", SEED, "--json"]);
    if c.expect == "error" {
        if run.success() {
            return Err(format!("expected an error, got success: {}", run.stdout));
        }
        // A clean failure: non-zero exit, a message on stderr, nothing on
        // stdout, and no panic.
        if run.code != 1 || !run.stderr.starts_with("error: ") || !run.stdout.is_empty() {
            return Err(format!("expected a clean error exit, got {run:?}"));
        }
        if run.stderr.contains("panicked") {
            return Err(format!("error path panicked: {run:?}"));
        }
        return Ok(());
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
