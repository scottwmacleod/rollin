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

/// Builds the CLI once: `cargo test -p rollin-desktop-core` alone does not.
fn build_cli() {
    static BUILD: std::sync::Once = std::sync::Once::new();
    BUILD.call_once(|| {
        let cargo = std::env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
        let status = std::process::Command::new(cargo)
            .args(["build", "--quiet", "--package", "rollin", "--bin", "rollin"])
            .status()
            .expect("run cargo");
        assert!(status.success(), "cargo build -p rollin failed");
    });
}

fn cli(dir: &TempDir) -> Cli {
    build_cli();
    let mut cmd = Cli::cargo_bin("rollin").expect("rollin binary");
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
    let mut s = session(&dir);
    let state = s.state().unwrap();
    assert_eq!((state.system, state.default_system), (None, None));
    assert_eq!(state.systems, ["dnd5e"]);

    s.set_system(SystemScope::Default, None, Some("DnD5e"))
        .unwrap();
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
    assert!(err.contains("dnd5e"), "{err}");
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
