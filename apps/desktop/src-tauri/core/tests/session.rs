//! The app's session against the CLI: same seed, same totals; same files,
//! same presets.

use assert_cmd::Command as Cli;
use rollin_desktop_core::{Execution, Session};
use serde_json::{json, Value};
use tempfile::TempDir;

/// A session over a temp config dir laid out as the CLI finds it.
fn session(dir: &TempDir) -> Session {
    Session::new(Some(dir.path().to_path_buf()))
}

/// Builds the CLI once and returns the path cargo reports for it:
/// `cargo test -p rollin-desktop-core` alone does not build it, and where
/// cargo puts a binary depends on its target layout, so it is asked rather
/// than guessed.
fn build_cli() -> &'static std::path::Path {
    static BIN: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
    BIN.get_or_init(|| {
        let cargo = std::env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
        let output = std::process::Command::new(cargo)
            .args(["build", "--quiet", "--message-format=json"])
            .args(["--package", "rollin", "--bin", "rollin"])
            .stderr(std::process::Stdio::inherit())
            .output()
            .expect("run cargo");
        assert!(output.status.success(), "cargo build -p rollin failed");
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| serde_json::from_str::<Value>(line).ok())
            .find_map(|message| message["executable"].as_str().map(std::path::PathBuf::from))
            .expect("cargo reports the rollin binary")
    })
}

fn cli(dir: &TempDir) -> Cli {
    let mut cmd = Cli::new(build_cli());
    cmd.env("XDG_CONFIG_HOME", dir.path()).env_remove("HOME");
    cmd
}

fn wire(e: &Execution) -> Value {
    serde_json::to_value(e).unwrap()
}

/// Each roll's total in a `rolls` output.
fn app_totals(e: &Execution) -> Vec<i64> {
    let v = wire(e);
    assert_eq!(v["status"], "ok", "{v}");
    v["output"]["rolls"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["total"].as_i64().unwrap())
        .collect()
}

fn cli_totals(stdout: &[u8]) -> Vec<i64> {
    String::from_utf8_lossy(stdout)
        .lines()
        .flat_map(|line| {
            let v: Value = serde_json::from_str(line).unwrap();
            v["rolls"]
                .as_array()
                .unwrap()
                .iter()
                .map(|r| r["total"].as_i64().unwrap())
                .collect::<Vec<_>>()
        })
        .collect()
}

#[test]
fn seeded_session_matches_seeded_cli_session() {
    let dir = TempDir::new().unwrap();
    let lines = ["4d6dl1", "d20+5", "3x 2d6", "d100!"];
    let mut app = session(&dir);
    app.seed(Some(42));
    let ours: Vec<i64> = lines
        .iter()
        .flat_map(|l| app_totals(&app.execute(l)))
        .collect();

    let stdin: String = lines.iter().map(|l| format!("{l} --json\n")).collect();
    let out = cli(&dir)
        .args(["--seed", "42"])
        .write_stdin(stdin)
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    assert_eq!(ours, cli_totals(&out));
    assert!(ours.len() > lines.len(), "the repeat rolled several times");
}

#[test]
fn reseeding_restarts_the_stream() {
    let dir = TempDir::new().unwrap();
    let mut app = session(&dir);
    app.seed(Some(7));
    let first = app_totals(&app.execute("10d20"));
    app.seed(Some(7));
    assert_eq!(app_totals(&app.execute("10d20")), first);
    assert_eq!(app.state().unwrap().seed, Some(7));
    app.seed(None);
    assert_eq!(app.state().unwrap().seed, None);
}

#[test]
fn a_preset_saved_in_the_app_is_rolled_by_the_cli() {
    let dir = TempDir::new().unwrap();
    let mut app = session(&dir);
    assert!(matches!(
        app.execute("save atk d20+5"),
        Execution::Output(_)
    ));
    assert!(matches!(
        app.execute("save everyone 2d6 --global"),
        Execution::Output(_)
    ));
    let out = cli(&dir).args(["atk", "--json"]).assert().success();
    let v: Value = serde_json::from_slice(&out.get_output().stdout).unwrap();
    assert_eq!(v["rolls"][0]["formula"], "d20+5");
    let out = cli(&dir).args(["everyone", "--json"]).assert().success();
    let v: Value = serde_json::from_slice(&out.get_output().stdout).unwrap();
    assert_eq!(v["rolls"][0]["formula"], "2d6");
}

#[test]
fn a_preset_saved_by_the_cli_is_in_the_apps_state() {
    let dir = TempDir::new().unwrap();
    cli(&dir)
        .args(["save", "sneak", "d20+7"])
        .assert()
        .success();
    cli(&dir)
        .args(["save", "wild", "d100", "--global"])
        .assert()
        .success();
    cli(&dir).args(["set", "str", "16"]).assert().success();
    let state = session(&dir).state().unwrap();
    assert_eq!(state.active_character, "default");
    assert_eq!(state.characters, ["default"]);
    assert_eq!(state.vars, [("str".to_string(), 16)]);
    assert_eq!(
        state
            .presets
            .iter()
            .map(|p| &p.name[..])
            .collect::<Vec<_>>(),
        ["sneak"]
    );
    assert_eq!(
        state
            .global_presets
            .iter()
            .map(|p| &p.name[..])
            .collect::<Vec<_>>(),
        ["wild"]
    );
}

#[test]
fn the_active_character_is_shared_through_the_files() {
    let dir = TempDir::new().unwrap();
    let mut app = session(&dir);
    app.execute("char new vex");
    let out = cli(&dir).arg("char").assert().success();
    assert!(String::from_utf8_lossy(&out.get_output().stdout).contains("vex"));
    cli(&dir).args(["char", "default"]).assert().success();
    assert_eq!(app.state().unwrap().active_character, "default");
}

#[test]
fn a_formula_error_carries_message_span_source_and_hints() {
    let dir = TempDir::new().unwrap();
    let v = wire(&session(&dir).execute("2d6 + 3x4"));
    assert_eq!(v["status"], "error");
    assert_eq!(v["error"]["kind"], "formula");
    assert!(!v["error"]["message"].as_str().unwrap().is_empty());
    assert_eq!(v["source"], "2d6 + 3x4");
    assert!(v["span"]["start"].as_u64().unwrap() < v["span"]["end"].as_u64().unwrap());
    assert!(v["error"]["hints"].is_array());
}

#[test]
fn an_error_with_a_hint_sends_the_hint_as_data() {
    let dir = TempDir::new().unwrap();
    let v = wire(&session(&dir).execute("d20 + @missing"));
    assert_eq!(v["error"]["kind"], "undefined_variable");
    assert!(v["span"]["end"].as_u64().unwrap() > v["span"]["start"].as_u64().unwrap());
    assert_eq!(v["source"], "d20 + @missing");
    let kinds: Vec<&str> = v["error"]["hints"]
        .as_array()
        .unwrap()
        .iter()
        .map(|h| h["kind"].as_str().unwrap())
        .collect();
    assert!(kinds.contains(&"set_variable"), "{kinds:?}");
}

#[test]
fn a_missing_config_dir_is_an_error_not_a_panic() {
    let mut app = Session::new(None);
    assert_eq!(wire(&app.execute("d20"))["error"]["kind"], "no_config_dir");
    let failure = serde_json::to_value(app.state().unwrap_err()).unwrap();
    assert_eq!(failure["status"], "error");
    assert_eq!(failure["error"]["kind"], "no_config_dir");
}

#[test]
fn output_carries_text_and_hints() {
    let dir = TempDir::new().unwrap();
    let v = wire(&session(&dir).execute("vars"));
    assert_eq!(v["output"]["kind"], "vars");
    assert_eq!(v["output"]["hints"], json!([{"kind": "add_variable"}]));
}

#[test]
fn session_words_work_and_history_dedupes_repeats() {
    let dir = TempDir::new().unwrap();
    let mut app = session(&dir);
    assert_eq!(app.execute("   "), Execution::Empty);
    app.execute("d6");
    app.execute("d6");
    app.execute("d8");
    assert_eq!(app.state().unwrap().history, ["d6", "d8"]);
    assert_eq!(app.history(), ["d6", "d8"]);
    let Execution::Text(lines) = app.execute("history") else {
        panic!("history is text");
    };
    assert_eq!(lines, ["1  d6", "2  d8", "3  history"]);
    let Execution::Text(help) = app.execute("HELP") else {
        panic!("help is text");
    };
    assert!(help[0].starts_with("Type a formula"));
    assert_eq!(app.execute("quit"), Execution::Quit);
}

#[test]
fn char_flag_applies_to_one_line_and_seed_flag_is_refused() {
    let dir = TempDir::new().unwrap();
    let mut app = session(&dir);
    app.execute("char new vex");
    app.execute("char default");
    app.execute("set hp 3 --char vex");
    assert!(app.state().unwrap().vars.is_empty());
    let v = wire(&app.execute("vars --char=vex"));
    assert_eq!(v["output"]["vars"], json!([["hp", 3]]));
    let Execution::Rejected(message) = app.execute("d20 --seed 5") else {
        panic!("--seed is refused");
    };
    assert!(message.contains("seed"));
    assert_eq!(app.state().unwrap().seed, None);
}

#[test]
fn complete_and_check_use_the_saved_names() {
    let dir = TempDir::new().unwrap();
    let mut app = session(&dir);
    app.execute("save fireball 8d6");
    let c = app.complete("fire", 4);
    assert_eq!((c.start, c.candidates), (0, vec!["fireball".to_string()]));
    assert!(app.check("fireball").is_ok());
    let failure = serde_json::to_value(app.check("2d").unwrap_err()).unwrap();
    assert_eq!(failure["error"]["kind"], "formula");
    assert!(failure["span"]["end"].is_u64());
}

#[test]
fn about_reports_build_versions_and_licence() {
    let info = serde_json::to_value(rollin_desktop_core::about("1.2.3")).unwrap();
    assert_eq!(info["name"], "Rollin");
    assert_eq!(info["app_version"], "1.2.3");
    assert_eq!(info["library_version"], rollin::version());
    assert_eq!(info["license"], "MIT");
    assert!(info["repository"].as_str().unwrap().starts_with("https://"));
}

#[test]
fn a_sample_leaves_the_seeded_stream_and_history_alone() {
    let dir = TempDir::new().unwrap();
    let mut plain = session(&dir);
    plain.seed(Some(9));
    let expected: Vec<i64> = ["4d6dl1", "d20+5"]
        .iter()
        .flat_map(|l| app_totals(&plain.execute(l)))
        .collect();

    let mut app = session(&dir);
    app.seed(Some(9));
    let first = app_totals(&app.execute("4d6dl1"));
    let sampled = app.sample("3x d20").unwrap();
    assert_eq!(sampled.len(), 3);
    assert!(app.sample("d20+").is_err());
    let second = app_totals(&app.execute("d20+5"));

    assert_eq!([first, second].concat(), expected);
    assert_eq!(app.state().unwrap().history, ["4d6dl1", "d20+5"]);
}

#[test]
fn system_is_read_and_written_in_the_cli_files() {
    use rollin_desktop_core::SystemScope;
    let dir = TempDir::new().unwrap();
    let s = session(&dir);
    let state = s.state().unwrap();
    assert_eq!((state.system, state.default_system), (None, None));
    assert_eq!(state.effective_system, None);
    assert_eq!(state.systems, ["dnd5e"]);

    s.set_system(SystemScope::Default, None, Some("DnD5e"))
        .unwrap();
    assert_eq!(
        s.state().unwrap().effective_system.as_deref(),
        Some("dnd5e")
    );
    s.set_system(SystemScope::Character, None, Some("dnd5e"))
        .unwrap();
    let state = s.state().unwrap();
    assert_eq!(state.system.as_deref(), Some("dnd5e"));
    assert_eq!(state.default_system.as_deref(), Some("dnd5e"));
    let file = std::fs::read_to_string(dir.path().join("rollin/characters/default.toml")).unwrap();
    assert!(file.contains("system = \"dnd5e\""), "{file}");

    s.set_system(SystemScope::Character, None, None).unwrap();
    s.set_system(SystemScope::Default, None, None).unwrap();
    let state = s.state().unwrap();
    assert_eq!((state.system, state.default_system), (None, None));

    let err = s
        .set_system(SystemScope::Default, None, Some("pathfinder"))
        .unwrap_err();
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["error"]["kind"], "unknown_system", "{json}");
    assert!(
        json["error"]["message"].as_str().unwrap().contains("dnd5e"),
        "{json}"
    );
}

#[test]
fn help_and_completion_offer_only_the_flags_the_app_accepts() {
    let dir = TempDir::new().unwrap();
    let mut app = session(&dir);
    let help = wire(&app.execute("help"))["lines"].to_string();
    assert!(help.contains("--char"), "{help}");
    for flag in ["--seed", "--json", "--color", "-q"] {
        assert!(!help.contains(flag), "help advertises {flag}: {help}");
    }
    assert_eq!(
        app.complete("--", 2).candidates,
        ["--char", "--force", "--global"]
    );
}

fn edit(s: &mut Session, edit: Value) -> Value {
    let edit = serde_json::from_value(edit).expect("a valid edit");
    wire(&s.edit(&edit))
}

#[test]
fn typed_edits_are_in_the_files_the_cli_reads_and_not_in_the_history() {
    let dir = TempDir::new().unwrap();
    let mut s = session(&dir);
    edit(
        &mut s,
        json!({"kind": "new_character", "name": "grog", "system": null}),
    );
    edit(
        &mut s,
        json!({"kind": "set_variable", "name": "str", "value": " 3 "}),
    );
    let saved = edit(
        &mut s,
        json!({"kind": "save_preset", "name": "atk", "formula": "d20+@str", "global": false}),
    );
    assert_eq!(saved["status"], "ok", "{saved}");
    assert!(s.history().is_empty(), "edits are not typed lines");
    let out = cli(&dir)
        .args(["--json", "--seed", "1", "atk"])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert_eq!(cli_totals(&out.stdout).len(), 1);
}

#[test]
fn a_typed_edit_fails_with_the_same_error_as_the_typed_line() {
    let dir = TempDir::new().unwrap();
    let mut s = session(&dir);
    let typed = wire(&s.execute("set str x"));
    let edited = edit(
        &mut s,
        json!({"kind": "set_variable", "name": "str", "value": "x"}),
    );
    assert_eq!(typed["status"], "error", "{typed}");
    assert_eq!(edited, typed);
    let typed = wire(&s.execute("save atk d20+"));
    let edited = edit(
        &mut s,
        json!({"kind": "save_preset", "name": "atk", "formula": "d20+", "global": false}),
    );
    assert_eq!(edited, typed);
}

fn preset_names(s: &mut Session) -> (Vec<String>, Vec<String>) {
    let state = serde_json::to_value(s.state().unwrap()).unwrap();
    let names = |key: &str| {
        state[key]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| {
                format!(
                    "{}={}",
                    p["name"].as_str().unwrap(),
                    p["formula"].as_str().unwrap()
                )
            })
            .collect()
    };
    (names("presets"), names("global_presets"))
}

#[test]
fn moving_a_preset_renames_it_or_moves_it_to_the_global_ones() {
    let dir = TempDir::new().unwrap();
    let mut s = session(&dir);
    edit(
        &mut s,
        json!({"kind": "save_preset", "name": "atk", "formula": "d20", "global": false}),
    );
    let renamed = edit(
        &mut s,
        json!({"kind": "move_preset", "from": {"name": "atk", "global": false},
               "name": "strike", "formula": "d20+5", "global": false}),
    );
    assert_eq!(renamed["status"], "ok", "{renamed}");
    assert_eq!(preset_names(&mut s), (vec!["strike=d20+5".into()], vec![]));
    edit(
        &mut s,
        json!({"kind": "move_preset", "from": {"name": "strike", "global": false},
               "name": "strike", "formula": "d20+5", "global": true}),
    );
    assert_eq!(preset_names(&mut s), (vec![], vec!["strike=d20+5".into()]));
}

#[test]
fn a_failed_move_leaves_the_original_and_changes_nothing() {
    let dir = TempDir::new().unwrap();
    let mut s = session(&dir);
    edit(
        &mut s,
        json!({"kind": "save_preset", "name": "atk", "formula": "d20", "global": false}),
    );
    edit(
        &mut s,
        json!({"kind": "save_preset", "name": "dmg", "formula": "d8", "global": false}),
    );
    let before = preset_names(&mut s);
    // A formula that does not parse: nothing is saved, nothing deleted.
    let bad_formula = edit(
        &mut s,
        json!({"kind": "move_preset", "from": {"name": "atk", "global": false},
               "name": "strike", "formula": "d20+", "global": false}),
    );
    assert_eq!(bad_formula["status"], "error", "{bad_formula}");
    assert_eq!(preset_names(&mut s), before);
    // The original is not there to delete: the new name is not left behind,
    // and a preset the move would have overwritten keeps its formula.
    let missing = edit(
        &mut s,
        json!({"kind": "move_preset", "from": {"name": "ghost", "global": false},
               "name": "dmg", "formula": "d12", "global": false}),
    );
    assert_eq!(missing["status"], "error", "{missing}");
    assert_eq!(preset_names(&mut s), before);
}

#[test]
fn a_new_character_can_start_with_a_game_system_and_a_bad_one_creates_nothing() {
    let dir = TempDir::new().unwrap();
    let mut s = session(&dir);
    let bad = edit(
        &mut s,
        json!({"kind": "new_character", "name": "tess", "system": "nope"}),
    );
    assert_eq!(bad["status"], "error", "{bad}");
    assert_eq!(
        serde_json::to_value(s.state().unwrap()).unwrap()["characters"],
        json!(["default"])
    );
    let ok = edit(
        &mut s,
        json!({"kind": "new_character", "name": "tess", "system": "dnd5e"}),
    );
    assert_eq!(ok["status"], "ok", "{ok}");
    let state = serde_json::to_value(s.state().unwrap()).unwrap();
    assert_eq!(
        (&state["active_character"], &state["system"]),
        (&json!("tess"), &json!("dnd5e"))
    );
}
