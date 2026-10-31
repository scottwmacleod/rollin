//! Global presets and the shared command layer, through the CLI seam.

mod common;

use common::Cli;

#[test]
fn a_saved_preset_is_listed() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "attack", "d20+5"])
        .assert_success();
    let listed = cli.run(&["presets"]);
    listed.assert_success();
    assert_eq!(listed.stdout, "attack  d20+5  [global]\n");
}

#[test]
fn listing_with_no_presets_says_so() {
    let run = Cli::new().run(&["presets"]);
    run.assert_success();
    assert_eq!(
        run.stdout,
        "No presets saved. Add one with: rollin save <name> <formula>\n"
    );
}

#[test]
fn saving_an_invalid_formula_shows_the_span_error_and_saves_nothing() {
    let cli = Cli::new();
    let run = cli.run(&["save", "--global", "bad", "d20+"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert_eq!(
        run.stderr,
        "error: expected a number, a dice group or '(', found end of input\n  d20+\n      ^\n"
    );
    assert!(run.stdout.is_empty());
    assert!(cli.run(&["presets"]).stdout.starts_with("No presets"));
}

#[test]
fn a_preset_rolls_by_bare_name_with_a_header() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "atk", "d20+5"])
        .assert_success();
    let by_name = cli.run(&["atk", "--seed", "3"]);
    by_name.assert_success();
    let direct = cli.run(&["d20+5", "--seed", "3"]);
    assert_eq!(
        by_name.stdout,
        format!("(preset 'atk': d20+5)\n{}", direct.stdout)
    );
}

#[test]
fn json_and_quiet_output_for_a_preset_have_no_header() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "pair", "d20+5, 2d6"])
        .assert_success();
    let json = cli.run(&["pair", "--seed", "3", "--json"]);
    assert_eq!(json.json()["rolls"].as_array().unwrap().len(), 2);
    let quiet = cli.run(&["pair", "--seed", "3", "-q"]);
    quiet.assert_success();
    assert_eq!(quiet.stdout.lines().count(), 2, "{quiet:?}");
    assert!(!quiet.stdout.contains("preset"));
}

#[test]
fn verbose_output_for_a_preset_keeps_the_header() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "atk", "d20+5"])
        .assert_success();
    let run = cli.run(&["atk", "--seed", "3", "-v"]);
    run.assert_success();
    assert!(run.stdout.starts_with("(preset 'atk': d20+5)\n"), "{run:?}");
}

#[test]
fn roll_command_accepts_a_formula_or_a_preset_name() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "atk", "d20+5"])
        .assert_success();
    let formula = cli.run(&["roll", "2d6", "+", "1", "--seed", "4"]);
    let direct = cli.run(&["2d6 + 1", "--seed", "4"]);
    formula.assert_success();
    assert_eq!(formula.stdout, direct.stdout);
    let preset = cli.run(&["ROLL", "ATK", "--seed", "4"]);
    preset.assert_success();
    assert_eq!(preset.stdout, cli.run(&["atk", "--seed", "4"]).stdout);
}

#[test]
fn an_unknown_lone_word_names_itself_and_suggests_presets() {
    let cli = Cli::new();
    for args in [&["nosuch"][..], &["roll", "nosuch"]] {
        let run = cli.run(args);
        assert_eq!(run.code, 1, "{run:?}");
        assert!(run.stdout.is_empty());
        assert_eq!(
            run.stderr,
            "error: 'nosuch' is not a valid formula or a known preset\nhint: run `rollin presets` to list saved presets\n"
        );
    }
}

#[test]
fn an_unknown_word_close_to_a_preset_suggests_it() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "attack", "d20+5"])
        .assert_success();
    let run = cli.run(&["atack"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert_eq!(
        run.stderr,
        "error: 'atack' is not a valid formula or a known preset\nhint: did you mean 'attack'?\nhint: run `rollin presets` to list saved presets\n"
    );
}

#[test]
fn a_malformed_dice_word_keeps_its_formula_error() {
    let run = Cli::new().run(&["d6dl9"]);
    assert_eq!(run.code, 1);
    assert!(run.stderr.contains("^"), "{run:?}");
    assert!(!run.stderr.contains("known preset"), "{run:?}");
}

#[test]
fn delete_removes_a_preset_case_insensitively() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "atk", "d20+5"])
        .assert_success();
    cli.run(&["save", "--global", "keep", "d6"])
        .assert_success();
    let run = cli.run(&["delete", "ATK"]);
    run.assert_success();
    assert_eq!(run.stdout, "deleted 'atk'\n");
    assert_eq!(cli.run(&["presets"]).stdout, "keep  d6  [global]\n");
}

#[test]
fn deleting_a_missing_preset_is_an_error() {
    let run = Cli::new().run(&["delete", "ghost"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert!(run.stdout.is_empty());
    assert_eq!(run.stderr, "error: no preset named 'ghost'\n");
}

#[test]
fn delete_without_a_name_prints_usage() {
    let run = Cli::new().run(&["delete"]);
    assert_eq!(run.code, 1);
    assert_eq!(run.stderr, "error: usage: delete <name>\n");
}

#[test]
fn saving_over_an_existing_preset_says_so() {
    let cli = Cli::new();
    let first = cli.run(&["save", "--global", "Atk", "d20+5"]);
    assert_eq!(first.stdout, "saved 'atk': d20+5\n");
    let second = cli.run(&["save", "--global", "atk", "d20+7"]);
    second.assert_success();
    assert_eq!(second.stdout, "replaced 'atk' (was d20+5): d20+7\n");
    assert_eq!(cli.run(&["presets"]).stdout, "atk  d20+7  [global]\n");
}

#[test]
fn presets_are_listed_sorted_by_name() {
    let cli = Cli::new();
    for (name, formula) in [("zed", "d4"), ("alpha", "d6"), ("mid", "d8")] {
        cli.run(&["save", "--global", name, formula])
            .assert_success();
    }
    assert_eq!(
        cli.run(&["presets"]).stdout,
        "alpha  d6  [global]\nmid    d8  [global]\nzed    d4  [global]\n"
    );
}

#[test]
fn save_without_a_formula_prints_usage() {
    for args in [&["save"][..], &["save", "--global", "lonely"]] {
        let run = Cli::new().run(args);
        assert_eq!(run.code, 1);
        assert_eq!(
            run.stderr,
            "error: usage: save <name> <formula> [--global]\n"
        );
    }
}

#[test]
fn names_that_break_a_rule_are_rejected_at_save_with_the_rule() {
    let shape = "names must start with a letter and use only letters, digits, '_' or '-'";
    let cases: &[(&str, String)] = &[
        ("Foo Bar", format!("invalid preset name 'Foo Bar': {shape}")),
        ("9lives", format!("invalid preset name '9lives': {shape}")),
        ("", format!("invalid preset name '': {shape}")),
        (
            "save",
            "invalid preset name 'save': it is a command word (save, presets, delete, import, roll, set, unset, vars, char, characters)".into(),
        ),
        (
            "PRESETS",
            "invalid preset name 'PRESETS': it is a command word (save, presets, delete, import, roll, set, unset, vars, char, characters)".into(),
        ),
        ("adv", "invalid preset name 'adv': it is a reserved dice keyword".into()),
        ("dis", "invalid preset name 'dis': it is a reserved dice keyword".into()),
        ("kh", "invalid preset name 'kh': it is a reserved dice keyword".into()),
        ("d20", "invalid preset name 'd20': it would parse as the dice formula d20".into()),
        ("D6", "invalid preset name 'D6': it would parse as the dice formula D6".into()),
        ("df", "invalid preset name 'df': it is a reserved dice keyword".into()),
    ];
    for (name, message) in cases {
        let cli = Cli::new();
        let run = cli.run(&["save", "--global", name, "d20"]);
        assert_eq!(run.code, 1, "{name:?}: {run:?}");
        assert_eq!(run.stderr, format!("error: {message}\n"), "{name:?}");
        assert!(cli.run(&["presets"]).stdout.starts_with("No presets"));
    }
}

#[test]
fn v1_style_names_are_accepted() {
    let cli = Cli::new();
    for name in ["adv-attack", "dis_attack", "braceup", "a1"] {
        cli.run(&["save", "--global", name, "d20"]).assert_success();
        cli.run(&[name, "--seed", "1"]).assert_success();
    }
}

/// Writes `contents` as this config dir's presets file and returns its path.
fn write_store(cli: &Cli, contents: &str) -> std::path::PathBuf {
    let dir = cli.config_dir().join("rollin");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("presets.toml");
    std::fs::write(&path, contents).unwrap();
    path
}

#[test]
fn a_corrupt_file_is_a_clear_error_and_is_never_overwritten() {
    let cli = Cli::new();
    let garbage = "[presets\nattack = = d20\n";
    let path = write_store(&cli, garbage);
    for args in [
        &["presets"][..],
        &["save", "--global", "new", "d6"],
        &["delete", "attack"],
        &["roll", "attack"],
        &["attack"],
    ] {
        let run = cli.run(args);
        assert_eq!(run.code, 1, "{args:?}: {run:?}");
        assert!(run.stdout.is_empty(), "{args:?}: {run:?}");
        assert!(
            run.stderr
                .starts_with(&format!("error: {}: not valid TOML: ", path.display())),
            "{args:?}: {run:?}"
        );
        assert!(!run.stderr.contains("panicked"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), garbage, "{args:?}");
    }
}

#[test]
fn wrong_typed_store_contents_are_clear_errors() {
    let cases = [
        ("presets = \"nope\"\n", "`presets` must be a table"),
        (
            "[presets]\nattack = 5\n",
            "preset 'attack' must be a string",
        ),
        (
            "[presets]\nattack = [\"d20\"]\n",
            "preset 'attack' must be a string",
        ),
    ];
    for (contents, problem) in cases {
        let cli = Cli::new();
        let path = write_store(&cli, contents);
        let run = cli.run(&["presets"]);
        assert_eq!(run.code, 1, "{contents:?}: {run:?}");
        assert_eq!(
            run.stderr,
            format!("error: {}: {problem}\n", path.display()),
            "{contents:?}"
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
    }
}

/// Runs `rollin save k d6` with exactly the given `XDG_CONFIG_HOME` / `HOME`.
fn save_with_env(xdg: Option<&str>, home: Option<&std::path::Path>) -> common::Run {
    let mut cmd = assert_cmd::Command::cargo_bin("rollin").unwrap();
    cmd.env_remove("XDG_CONFIG_HOME").env_remove("HOME");
    if let Some(xdg) = xdg {
        cmd.env("XDG_CONFIG_HOME", xdg);
    }
    if let Some(home) = home {
        cmd.env("HOME", home);
    }
    let out = cmd.args(["save", "--global", "k", "d6"]).output().unwrap();
    common::Run {
        stdout: String::from_utf8(out.stdout).unwrap(),
        stderr: String::from_utf8(out.stderr).unwrap(),
        code: out.status.code().unwrap_or(-1),
    }
}

#[test]
fn an_empty_or_relative_xdg_config_home_falls_back_to_home_config() {
    for xdg in [None, Some(""), Some("relative/dir")] {
        let home = tempfile::TempDir::new().unwrap();
        save_with_env(xdg, Some(home.path())).assert_success();
        assert!(
            home.path().join(".config/rollin/presets.toml").is_file(),
            "XDG_CONFIG_HOME={xdg:?}"
        );
    }
}

#[test]
fn an_absolute_xdg_config_home_wins_and_holds_toml() {
    let xdg = tempfile::TempDir::new().unwrap();
    let home = tempfile::TempDir::new().unwrap();
    save_with_env(xdg.path().to_str(), Some(home.path())).assert_success();
    let raw = std::fs::read_to_string(xdg.path().join("rollin/presets.toml")).unwrap();
    assert_eq!(raw, "[presets]\nk = \"d6\"\n");
    assert!(!home.path().join(".config").exists());
}

#[test]
fn no_usable_config_directory_is_a_clear_error() {
    let run = save_with_env(None, None);
    assert_eq!(run.code, 1, "{run:?}");
    assert_eq!(
        run.stderr,
        "error: cannot find a config directory: set XDG_CONFIG_HOME or HOME\n"
    );
}

#[test]
fn writes_leave_only_the_presets_file_behind() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "a", "d4"]).assert_success();
    cli.run(&["save", "--global", "b", "d6"]).assert_success();
    cli.run(&["delete", "a"]).assert_success();
    let mut names: Vec<_> = std::fs::read_dir(cli.config_dir().join("rollin"))
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    assert_eq!(names, ["presets.toml"]);
}

#[test]
fn a_failed_write_keeps_the_old_file_and_leaves_no_temp_file() {
    use std::os::unix::fs::PermissionsExt;
    let cli = Cli::new();
    cli.run(&["save", "--global", "a", "d4"]).assert_success();
    let dir = cli.config_dir().join("rollin");
    let before = std::fs::read_to_string(dir.join("presets.toml")).unwrap();
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o500)).unwrap();
    let run = cli.run(&["save", "--global", "b", "d6"]);
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(run.code, 1, "{run:?}");
    assert!(run.stderr.starts_with("error: "), "{run:?}");
    assert_eq!(
        std::fs::read_to_string(dir.join("presets.toml")).unwrap(),
        before
    );
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
}

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/presets.json");

fn fixture_names() -> Vec<String> {
    let raw = std::fs::read_to_string(FIXTURE).unwrap();
    let map: std::collections::BTreeMap<String, String> = serde_json::from_str(&raw).unwrap();
    map.into_keys().collect()
}

#[test]
fn the_real_v1_file_imports_with_no_skips_and_every_preset_rolls() {
    let cli = Cli::new();
    let names = fixture_names();
    let run = cli.run(&["import", FIXTURE]);
    run.assert_success();
    assert_eq!(run.stdout, "imported 10, skipped 0\n");
    assert_eq!(names.len(), 10);
    let listed = cli.run(&["presets"]).stdout;
    for name in &names {
        let rolled = cli.run(&[name, "--seed", "1"]);
        rolled.assert_success();
        assert!(
            rolled.stdout.starts_with(&format!("(preset '{name}': ")),
            "{rolled:?}"
        );
        assert!(
            listed.contains(name.as_str()),
            "{name} missing from {listed}"
        );
        let json = cli.run(&["roll", name, "--seed", "1", "--json"]);
        assert!(
            !json.json()["rolls"].as_array().unwrap().is_empty(),
            "{name}"
        );
    }
}

/// Writes `json` to a file in the Cli's config dir and returns its path.
fn write_json(cli: &Cli, json: &str) -> String {
    let path = cli.config_dir().join("v1.json");
    std::fs::write(&path, json).unwrap();
    path.to_str().unwrap().to_string()
}

/// The formula `presets` lists for `name`.
fn formula_of(cli: &Cli, name: &str) -> String {
    let listed = cli.run(&["presets"]).stdout;
    let line = listed
        .lines()
        .find(|l| l.split_whitespace().next() == Some(name))
        .unwrap_or_else(|| panic!("{name} not listed in {listed}"));
    line[name.len()..]
        .trim()
        .strip_suffix("[global]")
        .expect("global marker")
        .trim()
        .to_string()
}

#[test]
fn importing_again_skips_existing_names_unless_forced() {
    let cli = Cli::new();
    cli.run(&["import", FIXTURE]).assert_success();
    let again = cli.run(&["import", FIXTURE]);
    again.assert_success();
    let names = fixture_names();
    let mut expected: String = names
        .iter()
        .map(|n| format!("skipped '{n}': already exists (use --force to overwrite)\n"))
        .collect();
    expected.push_str("imported 0, skipped 10\n");
    assert_eq!(again.stdout, expected);

    let json = write_json(&cli, r#"{"braceup": "d6", "fresh": "d8"}"#);
    let merged = cli.run(&["import", &json]);
    assert_eq!(
        merged.stdout,
        "skipped 'braceup': already exists (use --force to overwrite)\nimported 1, skipped 1\n"
    );
    assert_eq!(formula_of(&cli, "braceup"), "d10+9");

    let forced = cli.run(&["import", &json, "--force"]);
    forced.assert_success();
    assert_eq!(forced.stdout, "imported 2, skipped 0\n");
    assert_eq!(formula_of(&cli, "braceup"), "d6");
}

#[test]
fn import_skips_bad_entries_with_reasons_and_keeps_the_good_ones() {
    let cli = Cli::new();
    let json = write_json(
        &cli,
        r#"{
            "good": "2d6+1",
            "Shouty": "d4",
            "d20": "d20+1",
            "save": "d6",
            "adv": "d6",
            "bad formula": "d6",
            "broken": "d20+",
            "number": 5,
            "nothing": null,
            "nested": ["d6"]
        }"#,
    );
    let run = cli.run(&["import", &json]);
    run.assert_success();
    let lines: Vec<&str> = run.stdout.lines().collect();
    let expect = [
        "skipped 'adv': it is a reserved dice keyword",
        "skipped 'bad formula': names must start with a letter and use only letters, digits, '_' or '-'",
        "skipped 'broken': invalid formula: expected a number, a dice group or '(', found end of input",
        "skipped 'd20': it would parse as the dice formula d20",
        "skipped 'nested': value must be a string, found an array",
        "skipped 'nothing': value must be a string, found null",
        "skipped 'number': value must be a string, found a number",
        "skipped 'save': it is a command word (save, presets, delete, import, roll, set, unset, vars, char, characters)",
        "imported 2, skipped 8",
    ];
    assert_eq!(lines, expect);
    assert_eq!(formula_of(&cli, "good"), "2d6+1");
    assert_eq!(formula_of(&cli, "shouty"), "d4");
}

#[test]
fn import_of_names_differing_only_by_case_keeps_the_first() {
    let cli = Cli::new();
    let json = write_json(&cli, r#"{"Atk": "d20", "atk": "d6"}"#);
    let run = cli.run(&["import", &json]);
    assert_eq!(
        run.stdout,
        "skipped 'atk': already exists (use --force to overwrite)\nimported 1, skipped 1\n"
    );
    assert_eq!(formula_of(&cli, "atk"), "d20");
}

#[test]
fn an_unusable_import_file_is_an_error_and_changes_nothing() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "keep", "d6"])
        .assert_success();
    let missing = cli.config_dir().join("nope.json");
    let run = cli.run(&["import", missing.to_str().unwrap()]);
    assert_eq!(run.code, 1);
    assert!(
        run.stderr
            .starts_with(&format!("error: {}: ", missing.display())),
        "{run:?}"
    );
    for (contents, problem) in [
        ("not json", "not valid JSON: "),
        ("[\"d6\"]", "expected a JSON object of name to formula"),
        ("\"d6\"", "expected a JSON object of name to formula"),
    ] {
        let path = write_json(&cli, contents);
        let run = cli.run(&["import", &path]);
        assert_eq!(run.code, 1, "{contents}: {run:?}");
        assert!(run.stdout.is_empty());
        assert!(
            run.stderr.starts_with(&format!("error: {path}: {problem}")),
            "{run:?}"
        );
    }
    assert_eq!(cli.run(&["presets"]).stdout, "keep  d6  [global]\n");
}

#[test]
fn import_usage_and_corrupt_store() {
    let cli = Cli::new();
    for args in [
        &["import"][..],
        &["import", "a", "b"],
        &["import", "--force"],
    ] {
        let run = cli.run(args);
        assert_eq!(run.code, 1, "{args:?}");
        assert_eq!(run.stderr, "error: usage: import <path> [--force]\n");
    }
    let json = write_json(&cli, r#"{"a": "d6"}"#);
    let path = write_store(&cli, "oops = = 1");
    let run = cli.run(&["import", &json]);
    assert_eq!(run.code, 1);
    assert!(run.stderr.contains("not valid TOML"), "{run:?}");
    assert_eq!(std::fs::read_to_string(path).unwrap(), "oops = = 1");
}
