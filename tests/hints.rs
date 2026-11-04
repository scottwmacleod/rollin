//! Typed hints, neutral output text and the serialized shape of commands'
//! results, all through the library (no binary spawned). ADR 0007.

use rollin::{execute, parse_command, Command, CommandError, Context, Hint, Output};
use serde_json::json;
use tempfile::TempDir;

fn sandbox() -> (TempDir, Context) {
    let dir = TempDir::new().unwrap();
    let ctx = Context::new(Some(dir.path().to_path_buf()));
    (dir, ctx)
}

/// Parses and runs one command line, returning its output or error.
fn run(ctx: &Context, line: &str) -> Result<Output, CommandError> {
    let words: Vec<String> = line.split_whitespace().map(String::from).collect();
    let mut names = || ctx.preset_names();
    let command = parse_command(&words, &mut names)?;
    execute(&command, ctx, &mut rollin::seeded_rng(1))
}

fn err(ctx: &Context, line: &str) -> CommandError {
    run(ctx, line).unwrap_err()
}

fn ok(ctx: &Context, line: &str) -> Output {
    run(ctx, line).unwrap()
}

#[test]
fn repeat_without_dice_hints_multiplication() {
    let (_d, ctx) = sandbox();
    assert_eq!(
        err(&ctx, "2x3").hints(),
        vec![Hint::UseMultiplication {
            suggestion: Some("2*3".into())
        }]
    );
}

#[test]
fn undefined_variable_hints_in_order() {
    let (_d, ctx) = sandbox();
    assert_eq!(
        err(&ctx, "d20+@str").hints(),
        vec![
            Hint::DefinedVariables { names: vec![] },
            Hint::SetVariable {
                character: "default".into(),
                name: "str".into(),
                explicit: false
            },
        ]
    );
    ok(&ctx, "set strength 3");
    assert_eq!(
        err(&ctx, "d20+@strenth").hints(),
        vec![
            Hint::DefinedVariables {
                names: vec!["strength".into()]
            },
            Hint::DidYouMeanVariable {
                name: "strength".into()
            },
            Hint::SetVariable {
                character: "default".into(),
                name: "strenth".into(),
                explicit: false
            },
        ]
    );
}

#[test]
fn unknown_preset_hints_a_near_name_then_listing() {
    let (_d, ctx) = sandbox();
    ok(&ctx, "save attack d20+5");
    assert_eq!(
        err(&ctx, "attak").hints(),
        vec![
            Hint::DidYouMean {
                name: "attack".into()
            },
            Hint::ListPresets
        ]
    );
    assert_eq!(err(&ctx, "zzzzzz").hints(), vec![Hint::ListPresets]);
}

#[test]
fn unknown_character_hints_creation() {
    let (_d, ctx) = sandbox();
    assert_eq!(
        err(&ctx, "char grog").hints(),
        vec![Hint::CreateCharacter {
            name: "grog".into()
        }]
    );
}

#[test]
fn global_preset_deleted_from_a_character_hints_the_global_delete() {
    let (_d, ctx) = sandbox();
    ok(&ctx, "save --global hit d20");
    ok(&ctx, "char new grog");
    assert_eq!(
        err(&ctx, "delete hit").hints(),
        vec![Hint::DeleteGlobalPreset { name: "hit".into() }]
    );
}

#[test]
fn session_only_help_hints_the_flag_but_other_words_do_not() {
    let help = CommandError::SessionOnly {
        word: "Help".into(),
    };
    assert_eq!(help.hints(), vec![Hint::UseHelpFlag]);
    let quit = CommandError::SessionOnly {
        word: "quit".into(),
    };
    assert!(quit.hints().is_empty());
}

#[test]
fn errors_without_a_next_step_have_no_hints() {
    let (_d, ctx) = sandbox();
    let e = err(&ctx, "set x notanumber");
    assert!(e.hints().is_empty());
    assert_eq!(
        e.message(),
        format!(
            "'notanumber' is not an integer; variables hold whole numbers from {} to {}",
            i64::MIN,
            i64::MAX
        )
    );
}

#[test]
fn lines_are_neutral_sentences_for_single_line_outputs() {
    let (_d, ctx) = sandbox();
    let lines = |line: &str| ok(&ctx, line).lines();
    assert_eq!(lines("save atk d20+5"), ["saved 'atk' on 'default': d20+5"]);
    assert_eq!(
        lines("save atk d20+6"),
        ["replaced 'atk' on 'default' (was d20+5): d20+6"]
    );
    assert_eq!(lines("set str 3"), ["set str = 3 on 'default'"]);
    assert_eq!(lines("unset str"), ["unset str on 'default'"]);
    assert_eq!(
        lines("char new grog"),
        ["created character 'grog' and made it active"]
    );
    assert_eq!(lines("char default"), ["active character: default"]);
    assert_eq!(lines("char"), ["active character: default"]);
    assert_eq!(lines("delete atk"), ["deleted 'atk' from 'default'"]);
    assert_eq!(lines("char delete grog"), ["deleted character 'grog'"]);
}

#[test]
fn structured_outputs_have_no_lines_and_empty_lists_carry_hints() {
    let (_d, ctx) = sandbox();
    let presets = ok(&ctx, "presets");
    assert_eq!(presets.lines(), ["No presets saved."]);
    assert_eq!(presets.hints(), vec![Hint::AddPreset]);
    let vars = ok(&ctx, "vars");
    assert_eq!(vars.lines(), ["No variables set."]);
    assert_eq!(vars.hints(), vec![Hint::AddVariable]);

    ok(&ctx, "save atk d20");
    ok(&ctx, "set str 3");
    for line in ["presets", "vars", "characters", "d20"] {
        let out = ok(&ctx, line);
        assert!(out.lines().is_empty(), "{line}");
        assert!(out.hints().is_empty(), "{line}");
    }
}

#[test]
fn imported_lines_list_skips_then_the_summary() {
    let (dir, ctx) = sandbox();
    let path = dir.path().join("v1.json");
    std::fs::write(&path, r#"{"ok": "d20", "d20": "d6"}"#).unwrap();
    let mut rng = rollin::seeded_rng(1);
    let out = execute(&Command::Import { path, force: false }, &ctx, &mut rng).unwrap();
    let lines = out.lines();
    assert_eq!(lines.last().unwrap(), "imported 1, skipped 1");
    assert!(lines[0].starts_with("skipped 'd20': "), "{lines:?}");
}

#[test]
fn output_serializes_with_a_kind_tag() {
    let (_d, ctx) = sandbox();
    let value = |line: &str| serde_json::to_value(ok(&ctx, line)).unwrap();
    assert_eq!(
        value("save atk d20+5"),
        json!({"kind": "saved", "name": "atk", "formula": "d20+5",
               "character": "default", "replaced": null})
    );
    assert_eq!(
        value("char"),
        json!({"kind": "active_character", "name": "default"})
    );
    ok(&ctx, "set str 3");
    assert_eq!(value("vars"), json!({"kind": "vars", "vars": [["str", 3]]}));
    assert_eq!(
        value("presets"),
        json!({"kind": "presets", "presets": [{
            "name": "atk", "formula": "d20+5",
            "source": {"kind": "character", "name": "default"},
            "shadow": {"kind": "none"}}]})
    );
    assert_eq!(value("d20")["kind"], "rolls");
}

#[test]
fn errors_and_hints_serialize_with_a_kind_tag() {
    let (_d, ctx) = sandbox();
    let e = err(&ctx, "d20+@str");
    let value = serde_json::to_value(&e).unwrap();
    assert_eq!(value["kind"], "undefined_variable");
    assert_eq!(value["name"], "str");
    assert_eq!(value["error"]["kind"], "undefined_variable");
    assert_eq!(value["error"]["span"], json!({"start": 4, "end": 8}));
    assert_eq!(value["source"], "d20+@str");

    assert_eq!(
        serde_json::to_value(err(&ctx, "char grog").hints()).unwrap(),
        json!([{"kind": "create_character", "name": "grog"}])
    );
    assert_eq!(
        serde_json::to_value(Hint::ListPresets).unwrap(),
        json!({"kind": "list_presets"})
    );
    assert_eq!(
        serde_json::to_value(err(&ctx, "set Bad-name 1")).unwrap()["kind"],
        "invalid_var_name"
    );
}
