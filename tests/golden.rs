//! Data-driven golden tests: formula + seed -> expected `--json` output.
//!
//! Each `tests/fixtures/golden/*.json` file is one case:
//! `{"formula": "...", "seed": N, "expected": <json output tree>}`.
//! Adding a case is a data-only change; the case name is the file stem.

mod common;

use common::Cli;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Case {
    formula: String,
    seed: u64,
    expected: serde_json::Value,
}

#[test]
fn golden_fixtures_match() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden");
    let mut paths: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .map(|e| e.expect("dir entry").path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    paths.sort();
    assert!(!paths.is_empty(), "no golden fixtures in {}", dir.display());

    let cli = Cli::new();
    let mut failures = Vec::new();
    for path in &paths {
        let name = path.file_stem().unwrap().to_string_lossy();
        let raw = fs::read_to_string(path).expect("read fixture");
        let case: Case = match serde_json::from_str(&raw) {
            Ok(c) => c,
            Err(e) => {
                failures.push(format!("{name}: malformed fixture: {e}"));
                continue;
            }
        };
        let seed = case.seed.to_string();
        let run = cli.run(&["--seed", &seed, "--json", "--", &case.formula]);
        if !run.success() {
            failures.push(format!("{name}: rollin failed: {run:?}"));
            continue;
        }
        match serde_json::from_str::<serde_json::Value>(&run.stdout) {
            Ok(actual) if actual == case.expected => {}
            Ok(actual) => failures.push(format!(
                "{name}: `{} --seed {}`\n  expected: {}\n  actual:   {}",
                case.formula, case.seed, case.expected, actual
            )),
            Err(e) => failures.push(format!("{name}: stdout not JSON: {e}")),
        }
    }
    assert!(
        failures.is_empty(),
        "{} of {} golden cases failed:\n{}",
        failures.len(),
        paths.len(),
        failures.join("\n")
    );
}
