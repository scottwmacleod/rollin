//! Every `Output` and `CommandError` variant serialises with a snake_case
//! `kind` tag plus the same text the command line prints (ADR 0007).

use rollin::{
    execute, parse_command, CommandError, Context, ImportReport, NameError, NameRule, Output,
    PresetEntry, PresetSource, Shadow, StoreError,
};
use serde_json::{json, Value};
use std::path::PathBuf;

/// Exhaustive on purpose: a new variant fails to compile until it is added
/// here and to the lists below.
fn output_kind(o: &Output) -> &'static str {
    match o {
        Output::Rolls { .. } => "rolls",
        Output::Saved { .. } => "saved",
        Output::Deleted { .. } => "deleted",
        Output::Imported(_) => "imported",
        Output::VarUnset { .. } => "var_unset",
        Output::Characters { .. } => "characters",
        Output::ActiveCharacter { .. } => "active_character",
        Output::CharDeleted { .. } => "char_deleted",
        Output::CharCreated { .. } => "char_created",
        Output::CharSwitched { .. } => "char_switched",
        Output::Vars { .. } => "vars",
        Output::VarSet { .. } => "var_set",
        Output::Presets { .. } => "presets",
    }
}

fn error_kind(e: &CommandError) -> &'static str {
    match e {
        CommandError::Usage { .. } => "usage",
        CommandError::Formula { .. } => "formula",
        CommandError::UndefinedVariable(_) => "undefined_variable",
        CommandError::NoSuchPreset { .. } => "no_such_preset",
        CommandError::NoSuchCharacterPreset { .. } => "no_such_character_preset",
        CommandError::UnknownPreset { .. } => "unknown_preset",
        CommandError::SessionOnly { .. } => "session_only",
        CommandError::NoConfigDir => "no_config_dir",
        CommandError::Import { .. } => "import",
        CommandError::NoSuchCharacter { .. } => "no_such_character",
        CommandError::NoSuchVariable { .. } => "no_such_variable",
        CommandError::ActiveCharacterMissing { .. } => "active_character_missing",
        CommandError::CannotDeleteDefault => "cannot_delete_default",
        CommandError::CharacterExists { .. } => "character_exists",
        CommandError::InvalidCharName(_) => "invalid_char_name",
        CommandError::InvalidName(_) => "invalid_name",
        CommandError::InvalidVarName { .. } => "invalid_var_name",
        CommandError::NotAnInteger { .. } => "not_an_integer",
        CommandError::Store(_) => "store",
    }
}

fn s(text: &str) -> String {
    text.to_string()
}

fn run(ctx: &Context, line: &str) -> Result<Output, CommandError> {
    let words: Vec<String> = line.split_whitespace().map(String::from).collect();
    let mut names = || ctx.preset_names();
    let command = parse_command(&words, &mut names)?;
    execute(&command, ctx, &mut rollin::seeded_rng(1))
}

fn outputs() -> Vec<Output> {
    let dir = tempfile::TempDir::new().unwrap();
    let ctx = Context::new(Some(dir.path().to_path_buf()));
    vec![
        run(&ctx, "2d6+1").unwrap(),
        Output::Saved {
            name: s("atk"),
            formula: s("d20+5"),
            character: None,
            replaced: None,
        },
        Output::Saved {
            name: s("atk"),
            formula: s("d20+6"),
            character: Some(s("grog")),
            replaced: Some(s("d20+5")),
        },
        Output::Deleted {
            name: s("atk"),
            character: Some(s("grog")),
        },
        Output::Imported(ImportReport {
            imported: vec![s("atk")],
            skipped: vec![(s("bad"), s("not a formula"))],
        }),
        Output::VarUnset {
            name: s("str"),
            character: s("grog"),
        },
        Output::Characters {
            names: vec![s("default"), s("grog")],
            active: s("grog"),
        },
        Output::ActiveCharacter { name: s("grog") },
        Output::CharDeleted {
            name: s("grog"),
            was_active: true,
        },
        Output::CharCreated { name: s("grog") },
        Output::CharSwitched { name: s("grog") },
        Output::Vars { vars: vec![] },
        Output::Vars {
            vars: vec![(s("str"), 3)],
        },
        Output::VarSet {
            name: s("str"),
            value: 3,
            character: s("grog"),
        },
        Output::Presets { presets: vec![] },
        Output::Presets {
            presets: vec![PresetEntry {
                name: s("atk"),
                formula: s("d20+5"),
                source: PresetSource::Global,
                shadow: Shadow::ShadowedBy(s("grog")),
            }],
        },
    ]
}

fn errors() -> Vec<CommandError> {
    let dir = tempfile::TempDir::new().unwrap();
    let ctx = Context::new(Some(dir.path().to_path_buf()));
    let name_error = NameError {
        name: s("new"),
        rule: NameRule::CommandWord,
    };
    vec![
        CommandError::Usage {
            usage: s("rollin delete NAME"),
        },
        run(&ctx, "2d").unwrap_err(),
        run(&ctx, "d20+@str").unwrap_err(),
        CommandError::NoSuchPreset { name: s("atk") },
        CommandError::NoSuchCharacterPreset {
            name: s("atk"),
            character: s("grog"),
            global_exists: true,
        },
        CommandError::UnknownPreset {
            word: s("atq"),
            suggestion: Some(s("atk")),
        },
        CommandError::SessionOnly { word: s("help") },
        CommandError::NoConfigDir,
        CommandError::Import {
            path: PathBuf::from("v1.json"),
            message: s("not valid JSON"),
        },
        CommandError::NoSuchCharacter {
            name: s("grug"),
            suggestion: Some(s("grog")),
        },
        CommandError::NoSuchVariable {
            name: s("str"),
            character: s("grog"),
        },
        CommandError::ActiveCharacterMissing { name: s("grog") },
        CommandError::CannotDeleteDefault,
        CommandError::CharacterExists { name: s("grog") },
        CommandError::InvalidCharName(name_error.clone()),
        CommandError::InvalidName(name_error),
        CommandError::InvalidVarName { name: s("1x") },
        CommandError::NotAnInteger { value: s("x") },
        CommandError::Store(StoreError {
            path: PathBuf::from("presets.toml"),
            message: s("permission denied"),
        }),
    ]
}

#[test]
fn every_output_serialises_with_tag_and_text() {
    for output in outputs() {
        let value = serde_json::to_value(output.report()).unwrap();
        let kind = output_kind(&output);
        assert_eq!(value["kind"], kind, "{output:?}");
        assert_eq!(value["lines"], json!(output.lines()), "{kind}");
        assert_eq!(
            value["hints"],
            serde_json::to_value(output.hints()).unwrap(),
            "{kind}"
        );
        // The output's own fields are not nested under the report.
        assert_eq!(
            serde_json::to_value(&output).unwrap()["kind"],
            kind,
            "{kind}"
        );
    }
}

#[test]
fn every_error_serialises_with_tag_and_text() {
    for error in errors() {
        let value = serde_json::to_value(error.report()).unwrap();
        let kind = error_kind(&error);
        assert_eq!(value["kind"], kind, "{error:?}");
        assert_eq!(value["message"], error.to_string(), "{kind}");
        assert_eq!(
            value["hints"],
            serde_json::to_value(error.hints()).unwrap(),
            "{kind}"
        );
    }
}

#[test]
fn output_covers_every_kind() {
    let mut kinds: Vec<&str> = outputs().iter().map(output_kind).collect();
    kinds.sort();
    kinds.dedup();
    assert_eq!(kinds.len(), 13);
    let mut kinds: Vec<&str> = errors().iter().map(error_kind).collect();
    kinds.sort();
    kinds.dedup();
    assert_eq!(kinds.len(), 19);
}

#[test]
fn report_shapes() {
    let saved = Output::Saved {
        name: s("atk"),
        formula: s("d20+5"),
        character: None,
        replaced: None,
    };
    assert_eq!(
        serde_json::to_value(saved.report()).unwrap(),
        json!({"kind": "saved", "name": "atk", "formula": "d20+5",
               "character": null, "replaced": null,
               "lines": ["saved 'atk': d20+5"], "hints": []})
    );
    let e = CommandError::NoSuchCharacter {
        name: s("grug"),
        suggestion: Some(s("grog")),
    };
    let value: Value = serde_json::to_value(e.report()).unwrap();
    assert_eq!(value["message"], "no character named 'grug'");
    assert_eq!(
        value["hints"],
        json!([{"kind": "did_you_mean", "name": "grog"},
               {"kind": "create_character", "name": "grug"}])
    );
}
