use super::exec::check_formula;
use super::{CommandError, ImportReport, Output};
use crate::name::Name;
use crate::presets::Store;
use std::path::Path;

/// Merges a v1 `presets.json` into the global presets store.
pub(super) fn run(path: &Path, force: bool, store: &Store) -> Result<Output, CommandError> {
    let raw = std::fs::read_to_string(path).map_err(|e| CommandError::Import {
        path: path.to_path_buf(),
        message: e.to_string(),
    })?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|e| CommandError::Import {
        path: path.to_path_buf(),
        message: format!("not valid JSON: {e}"),
    })?;
    let entries = json.as_object().ok_or_else(|| CommandError::Import {
        path: path.to_path_buf(),
        message: "expected a JSON object of name to formula".into(),
    })?;
    let mut presets = store.load()?;
    let mut report = ImportReport::default();
    for (name, value) in entries {
        let skip = |reason: String| (name.clone(), reason);
        let key = match Name::preset(name) {
            Ok(key) => key.into_string(),
            Err(e) => {
                report.skipped.push(skip(e.reason()));
                continue;
            }
        };
        let Some(formula) = value.as_str() else {
            report.skipped.push(skip(format!(
                "value must be a string, found {}",
                json_kind(value)
            )));
            continue;
        };
        if let Err(CommandError::Formula { error, .. }) = check_formula(formula) {
            report
                .skipped
                .push(skip(format!("invalid formula: {}", error.message())));
            continue;
        }
        if presets.contains_key(&key) && (!force || report.imported.contains(&key)) {
            report
                .skipped
                .push(skip("already exists (use --force to overwrite)".into()));
            continue;
        }
        presets.insert(key.clone(), formula.to_string());
        report.imported.push(key);
    }
    if !report.imported.is_empty() {
        store.save(&presets)?;
    }
    Ok(Output::Imported(report))
}

fn json_kind(value: &serde_json::Value) -> &'static str {
    match value {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "a boolean",
        serde_json::Value::Number(_) => "a number",
        serde_json::Value::String(_) => "a string",
        serde_json::Value::Array(_) => "an array",
        serde_json::Value::Object(_) => "an object",
    }
}
