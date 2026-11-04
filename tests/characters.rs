//! Characters and variables, through the CLI seam.

mod common;

use common::Cli;

#[test]
fn set_reports_the_variable_and_character() {
    let cli = Cli::new();
    let set = cli.run(&["set", "str", "3"]);
    set.assert_success();
    assert_eq!(set.stdout, "set str = 3 on 'default'\n");
}

#[test]
fn vars_lists_what_an_earlier_run_set_sorted() {
    let cli = Cli::new();
    cli.run(&["set", "str", "3"]).assert_success();
    cli.run(&["set", "dex", "2"]).assert_success();
    let vars = cli.run(&["vars"]);
    vars.assert_success();
    assert_eq!(vars.stdout, "dex = 2\nstr = 3\n");
}

#[test]
fn a_variable_in_a_modifier_rolls_like_its_literal() {
    let cli = Cli::new();
    cli.run(&["set", "str", "3"]).assert_success();
    let with_var = cli.roll_json("d20+@str", 7);
    let literal = cli.roll_json("d20+3", 7);
    assert_eq!(with_var["rolls"][0]["total"], literal["rolls"][0]["total"]);
    assert_eq!(with_var["rolls"][0]["expr"], literal["rolls"][0]["expr"]);
}

/// Each formula with `@v` must roll exactly like the same formula with the
/// variable's value typed in, for variables in every numeric position.
#[test]
fn a_variable_works_in_every_position_a_literal_does() {
    let cli = Cli::new();
    for (name, value) in [("n", 4), ("s", 8), ("k", 2), ("x", 7), ("dc", 5), ("lv", 3)] {
        cli.run(&["set", name, &value.to_string()]).assert_success();
    }
    let table = [
        ("@lv d6", "3d6"),
        ("@lv d6dl1", "3d6dl1"),
        ("d@s", "d8"),
        ("@n d@s", "4d8"),
        ("4d6kh@k", "4d6kh2"),
        ("4d6dl@k", "4d6dl2"),
        ("4d6dh@k", "4d6dh2"),
        ("4d6kl@k", "4d6kl2"),
        ("4d8!>@x", "4d8!>7"),
        ("4d8!!>=@x", "4d8!!>=7"),
        ("4d8!p>@x", "4d8!p>7"),
        ("6d8r<@k", "6d8r<2"),
        ("6d8rr<@k", "6d8rr<2"),
        ("6d8r@k", "6d8r2"),
        ("6d10>=@dc", "6d10>=5"),
        ("6d10>@dc", "6d10>5"),
        ("6d10>=@dc f@k", "6d10>=5f2"),
        ("6d10>=@dc f<=@k", "6d10>=5f<=2"),
        ("@n x d20", "4x d20"),
        ("@n x d20, d6", "4x d20, d6"),
        ("@lv * (@n + 2) - @k / 2", "3 * (4 + 2) - 2 / 2"),
        ("d20 + @LV", "d20 + 3"),
    ];
    for (with_var, literal) in table {
        let a = cli.roll_json(with_var, 11);
        let b = cli.roll_json(literal, 11);
        let strip = |v: &serde_json::Value| -> Vec<(serde_json::Value, serde_json::Value)> {
            v["rolls"]
                .as_array()
                .unwrap()
                .iter()
                .map(|r| {
                    // A reason names the clause as written (`kh@k` vs `kh2`).
                    let mut dice = common::flat_dice(&r["expr"]);
                    for d in &mut dice {
                        if let Some(r) = d.get_mut("reason").and_then(|r| r.as_object_mut()) {
                            r.remove("clause");
                        }
                    }
                    (r["total"].clone(), dice.into())
                })
                .collect()
        };
        assert_eq!(strip(&a), strip(&b), "{with_var} vs {literal}");
    }
}

#[test]
fn set_rejects_values_that_are_not_i64_integers_and_stores_nothing() {
    let cli = Cli::new();
    for bad in [
        "3.5",
        "abc",
        "",
        "9223372036854775808",
        "0x10",
        "1e3",
        "+-1",
    ] {
        let run = cli.run(&["set", "str", bad]);
        assert_eq!(run.code, 1, "{bad:?}: {run:?}");
        assert_eq!(
            run.stderr,
            format!("error: '{bad}' is not an integer; variables hold whole numbers from -9223372036854775808 to 9223372036854775807\n"),
            "{bad:?}"
        );
        assert!(run.stdout.is_empty());
    }
    assert!(cli.run(&["vars"]).stdout.starts_with("No variables"));
}

#[test]
fn set_accepts_negative_and_extreme_integers() {
    let cli = Cli::new();
    let set = cli.run(&["set", "str", "-1"]);
    set.assert_success();
    assert_eq!(set.stdout, "set str = -1 on 'default'\n");
    cli.run(&["set", "big", "9223372036854775807"])
        .assert_success();
    cli.run(&["set", "small", "-9223372036854775808"])
        .assert_success();
    assert_eq!(
        cli.run(&["vars"]).stdout,
        "big = 9223372036854775807\nsmall = -9223372036854775808\nstr = -1\n"
    );
    let roll = cli.roll_json("d20+@str", 5);
    let literal = cli.roll_json("d20-1", 5);
    assert_eq!(roll["rolls"][0]["total"], literal["rolls"][0]["total"]);
}

#[test]
fn variable_names_are_case_insensitive_and_stored_lowercase() {
    let cli = Cli::new();
    cli.run(&["set", "STR", "3"]).assert_success();
    cli.run(&["set", "Str", "4"]).assert_success();
    assert_eq!(cli.run(&["vars"]).stdout, "str = 4\n");
    let file =
        std::fs::read_to_string(cli.config_dir().join("rollin/characters/default.toml")).unwrap();
    assert!(file.contains("str = 4"), "{file}");
    let roll = cli.roll_json("d20+@sTr", 5);
    assert_eq!(
        roll["rolls"][0]["expr"],
        cli.roll_json("d20+4", 5)["rolls"][0]["expr"]
    );
}

#[test]
fn set_rejects_bad_variable_names() {
    let cli = Cli::new();
    for bad in ["1x", "_x", "st-r", "st r", "", "a.b", "é"] {
        let run = cli.run(&["set", bad, "3"]);
        assert_eq!(run.code, 1, "{bad:?}: {run:?}");
        assert_eq!(
            run.stderr,
            format!("error: invalid variable name '{bad}': names must start with a letter and use only letters, digits or '_'\n"),
            "{bad:?}"
        );
    }
    assert!(cli.run(&["vars"]).stdout.starts_with("No variables"));
}

#[test]
fn an_undefined_variable_underlines_the_name_and_says_how_to_fix_it() {
    let cli = Cli::new();
    for (name, value) in [("con", "1"), ("dex", "2"), ("prof", "3")] {
        cli.run(&["set", name, value]).assert_success();
    }
    let run = cli.run(&["d20+@str"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert!(run.stdout.is_empty());
    assert_eq!(
        run.stderr,
        "error: undefined variable @str on character 'default'\n  d20+@str\n      ^^^^\ndefined: con, dex, prof\nset it with: rollin set str <value>\n"
    );
}

#[test]
fn an_undefined_variable_with_nothing_defined_says_so() {
    let run = Cli::new().run(&["d20 + @str"]);
    assert_eq!(
        run.stderr,
        "error: undefined variable @str on character 'default'\n  d20 + @str\n        ^^^^\nno variables are defined\nset it with: rollin set str <value>\n"
    );
}

#[test]
fn an_undefined_variable_offers_a_near_miss_within_two_edits() {
    let cli = Cli::new();
    cli.run(&["set", "str", "3"]).assert_success();
    cli.run(&["set", "wisdom", "3"]).assert_success();
    let run = cli.run(&["d20+@SRT"]);
    assert_eq!(
        run.stderr,
        "error: undefined variable @srt on character 'default'\n  d20+@SRT\n      ^^^^\ndefined: str, wisdom\ndid you mean @str?\nset it with: rollin set srt <value>\n"
    );
    let far = cli.run(&["d20+@zzzzz"]);
    assert!(!far.stderr.contains("did you mean"), "{far:?}");
}

#[track_caller]
fn assert_error(cli: &Cli, formula: &str, expected: &str) {
    let run = cli.run(&[formula]);
    assert_eq!(run.code, 1, "{formula}: {run:?}");
    assert_eq!(run.stderr, expected, "{formula}");
}

#[test]
fn range_errors_underline_the_variable_and_mention_its_value() {
    let cli = Cli::new();
    for (name, value) in [("s", "1"), ("n", "0"), ("big", "1001"), ("z", "0")] {
        cli.run(&["set", name, value]).assert_success();
    }
    assert_error(
        &cli,
        "d@s",
        "error: @s is 1 but sides must be between 2 and 10000\n  d@s\n   ^^\n",
    );
    assert_error(
        &cli,
        "@n d6",
        "error: @n is 0 but dice count must be at least 1\n  @n d6\n  ^^\n",
    );
    assert_error(
        &cli,
        "@big d6",
        "error: dice per term cap (1000) exceeded by '@big d6' (@big is 1001)\n  @big d6\n  ^^^^\n",
    );
    assert_error(
        &cli,
        "d6!>@z",
        "error: explosion condition '!>@z' is true for every face of a d6, so it would never stop (@z is 0)\n  d6!>@z\n    ^^^^\n",
    );
    assert_error(
        &cli,
        "@n x d20",
        "error: repeat count must be at least 1 (@n is 0)\n  @n x d20\n  ^^^^\n",
    );
}

#[test]
fn a_malformed_at_sign_is_a_syntax_error() {
    let cli = Cli::new();
    let hint = "'@' must be followed by a variable name that starts with a letter, as in '@str'";
    assert_error(&cli, "d20+@", &format!("error: {hint}\n  d20+@\n      ^\n"));
    assert_error(
        &cli,
        "d20+@1abc",
        &format!("error: {hint}\n  d20+@1abc\n      ^^^^^\n"),
    );
    assert_error(
        &cli,
        "d20+@_x",
        &format!("error: {hint}\n  d20+@_x\n      ^^^\n"),
    );
}

#[test]
fn a_fresh_install_has_only_the_virtual_default_character_active() {
    let cli = Cli::new();
    let list = cli.run(&["characters"]);
    list.assert_success();
    assert_eq!(list.stdout, "* default\n");
    let active = cli.run(&["char"]);
    active.assert_success();
    assert_eq!(active.stdout, "active character: default\n");
    assert!(
        !cli.config_dir().join("rollin").exists(),
        "reading must not create files"
    );
}

#[test]
fn char_new_creates_an_empty_character_and_makes_it_active_across_runs() {
    let cli = Cli::new();
    let made = cli.run(&["char", "new", "grog"]);
    made.assert_success();
    assert_eq!(made.stdout, "created character 'grog' and made it active\n");
    assert_eq!(cli.run(&["char"]).stdout, "active character: grog\n");
    assert_eq!(cli.run(&["characters"]).stdout, "  default\n* grog\n");
    let state = std::fs::read_to_string(cli.config_dir().join("rollin/state.toml")).unwrap();
    assert!(state.contains("active = \"grog\""), "{state}");
    assert!(cli
        .config_dir()
        .join("rollin/characters/grog.toml")
        .is_file());
    assert!(
        !cli.config_dir()
            .join("rollin/characters/default.toml")
            .exists(),
        "default stays virtual until written"
    );
}

#[test]
fn variables_belong_to_the_active_character() {
    let cli = Cli::new();
    cli.run(&["set", "str", "3"]).assert_success();
    cli.run(&["char", "new", "grog"]).assert_success();
    assert!(cli.run(&["vars"]).stdout.starts_with("No variables"));
    let set = cli.run(&["set", "str", "5"]);
    assert_eq!(set.stdout, "set str = 5 on 'grog'\n");
    assert_eq!(cli.run(&["vars"]).stdout, "str = 5\n");
    cli.run(&["char", "default"]).assert_success();
    assert_eq!(cli.run(&["vars"]).stdout, "str = 3\n");
    assert_eq!(
        cli.roll_json("d20+@str", 2)["rolls"][0]["expr"],
        cli.roll_json("d20+3", 2)["rolls"][0]["expr"]
    );
}

#[test]
fn switching_to_an_unknown_character_suggests_a_near_miss_and_creation() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    let run = cli.run(&["char", "gorg"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert_eq!(
        run.stderr,
        "error: no character named 'gorg'\nhint: did you mean 'grog'?\nhint: create it with: rollin char new gorg\n"
    );
    let far = cli.run(&["char", "zzzzzz"]);
    assert_eq!(
        far.stderr,
        "error: no character named 'zzzzzz'\nhint: create it with: rollin char new zzzzzz\n"
    );
    assert_eq!(cli.run(&["char"]).stdout, "active character: grog\n");
}

#[test]
fn char_new_refuses_existing_and_invalid_names() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    for (name, message) in [
        ("grog", "character 'grog' already exists"),
        ("GROG", "character 'grog' already exists"),
        ("default", "character 'default' already exists"),
        ("1x", "invalid character name '1x': names must start with a letter and use only letters, digits, '_' or '-'"),
        ("set", "invalid character name 'set': it is a command word (save, presets, delete, import, roll, set, unset, vars, char, characters, help, quit, exit, history)"),
        ("new", "invalid character name 'new': 'new' is reserved for `rollin char new`"),
    ] {
        let run = cli.run(&["char", "new", name]);
        assert_eq!(run.code, 1, "{name}: {run:?}");
        assert_eq!(run.stderr, format!("error: {message}\n"), "{name}");
    }
    assert_eq!(cli.run(&["characters"]).stdout, "  default\n* grog\n");
}

#[test]
fn command_words_cannot_be_preset_names() {
    let cli = Cli::new();
    for word in ["set", "unset", "vars", "char", "characters"] {
        let run = cli.run(&["save", word, "d20"]);
        assert_eq!(run.code, 1, "{word}: {run:?}");
        assert!(run.stderr.contains("it is a command word"), "{run:?}");
    }
}

#[test]
fn char_delete_removes_a_character_and_falls_back_to_default_when_active() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    cli.run(&["char", "new", "mira"]).assert_success();
    let other = cli.run(&["char", "delete", "grog"]);
    other.assert_success();
    assert_eq!(other.stdout, "deleted character 'grog'\n");
    assert!(!cli
        .config_dir()
        .join("rollin/characters/grog.toml")
        .exists());
    assert_eq!(cli.run(&["char"]).stdout, "active character: mira\n");
    let active = cli.run(&["char", "delete", "MIRA"]);
    active.assert_success();
    assert_eq!(
        active.stdout,
        "deleted character 'mira'; active character is now 'default'\n"
    );
    assert_eq!(cli.run(&["characters"]).stdout, "* default\n");
}

#[test]
fn the_default_character_cannot_be_deleted_and_unknown_ones_are_errors() {
    let cli = Cli::new();
    cli.run(&["set", "str", "3"]).assert_success();
    let run = cli.run(&["char", "delete", "default"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert_eq!(
        run.stderr,
        "error: the 'default' character cannot be deleted\n"
    );
    assert_eq!(cli.run(&["vars"]).stdout, "str = 3\n");
    let missing = cli.run(&["char", "delete", "nobody"]);
    assert_eq!(missing.code, 1);
    assert_eq!(
        missing.stderr,
        "error: no character named 'nobody'\nhint: create it with: rollin char new nobody\n"
    );
}

#[test]
fn unset_removes_a_variable_and_a_missing_one_is_an_error() {
    let cli = Cli::new();
    cli.run(&["set", "str", "3"]).assert_success();
    cli.run(&["set", "dex", "2"]).assert_success();
    let unset = cli.run(&["unset", "STR"]);
    unset.assert_success();
    assert_eq!(unset.stdout, "unset str on 'default'\n");
    assert_eq!(cli.run(&["vars"]).stdout, "dex = 2\n");
    let again = cli.run(&["unset", "str"]);
    assert_eq!(again.code, 1, "{again:?}");
    assert_eq!(
        again.stderr,
        "error: no variable named 'str' on character 'default'\n"
    );
    let usage = cli.run(&["unset"]);
    assert_eq!(usage.stderr, "error: usage: unset <name>\n");
}

#[test]
fn char_flag_overrides_for_one_call_and_never_persists() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    cli.run(&["set", "str", "5"]).assert_success();
    cli.run(&["char", "default"]).assert_success();
    cli.run(&["set", "str", "1"]).assert_success();

    let with_flag = cli.run(&["--char", "grog", "vars"]);
    assert_eq!(with_flag.stdout, "str = 5\n");
    let roll = cli.run(&["--char", "GROG", "d20+@str", "--seed", "4", "--json"]);
    roll.assert_success();
    assert_eq!(
        roll.json()["rolls"][0]["expr"],
        cli.roll_json("d20+5", 4)["rolls"][0]["expr"]
    );
    let set = cli.run(&["set", "--char", "grog", "con", "2"]);
    assert_eq!(set.stdout, "set con = 2 on 'grog'\n");

    assert_eq!(cli.run(&["char"]).stdout, "active character: default\n");
    assert_eq!(cli.run(&["vars"]).stdout, "str = 1\n");
    assert_eq!(
        cli.run(&["--char", "grog", "vars"]).stdout,
        "con = 2\nstr = 5\n"
    );
    let state = std::fs::read_to_string(cli.config_dir().join("rollin/state.toml")).unwrap();
    assert!(state.contains("\"default\""), "{state}");
}

#[test]
fn char_flag_needs_an_existing_character_or_default() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    let run = cli.run(&["--char", "gorg", "d20"]);
    assert_eq!(run.code, 1, "{run:?}");
    assert_eq!(
        run.stderr,
        "error: no character named 'gorg'\nhint: did you mean 'grog'?\nhint: create it with: rollin char new gorg\n"
    );
    cli.run(&["--char", "default", "d20"]).assert_success();
    assert_eq!(cli.run(&["char"]).stdout, "active character: grog\n");
}

#[test]
fn the_fix_line_mentions_char_only_when_it_was_used() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    let run = cli.run(&["--char", "default", "d20+@str"]);
    assert!(
        run.stderr
            .starts_with("error: undefined variable @str on character 'default'\n"),
        "{run:?}"
    );
    assert!(
        run.stderr
            .ends_with("set it with: rollin --char default set str <value>\n"),
        "{run:?}"
    );
    let plain = cli.run(&["d20+@str"]);
    assert!(plain.stderr.contains("on character 'grog'"), "{plain:?}");
    assert!(
        plain
            .stderr
            .ends_with("set it with: rollin set str <value>\n"),
        "{plain:?}"
    );
}

fn write_file(cli: &Cli, rel: &str, text: &str) -> std::path::PathBuf {
    let path = cli.config_dir().join("rollin").join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, text).unwrap();
    path
}

#[test]
fn an_active_character_with_no_file_is_a_clear_error_with_the_way_out() {
    let cli = Cli::new();
    write_file(&cli, "state.toml", "active = \"ghost\"\n");
    for args in [&["d20"][..], &["vars"], &["set", "a", "1"]] {
        let run = cli.run(args);
        assert_eq!(run.code, 1, "{args:?}: {run:?}");
        assert_eq!(
            run.stderr,
            "error: the active character 'ghost' does not exist; run `rollin char default` to switch back\n"
        );
    }
    assert_eq!(
        cli.run(&["characters"]).stdout,
        "  default\n* ghost (missing)\n"
    );
    cli.run(&["char", "default"]).assert_success();
    cli.run(&["d20"]).assert_success();
}

#[test]
fn corrupt_state_and_character_files_are_errors_naming_the_path_and_untouched() {
    let cli = Cli::new();
    let state_cmds: &[&[&str]] = &[
        &["vars"],
        &["set", "a", "1"],
        &["unset", "a"],
        &["d20"],
        &["char"],
        &["characters"],
        &["char", "new", "mira"],
        &["char", "default"],
        &["char", "grog"],
        &["char", "delete", "grog"],
    ];
    let char_cmds: &[&[&str]] = &[&["vars"], &["set", "a", "1"], &["unset", "a"], &["d20"]];
    let cases: [(&str, &str, &str, &[&[&str]]); 8] = [
        ("state.toml", "active = [", "not valid TOML", state_cmds),
        (
            "state.toml",
            "active = 3\n",
            "`active` must be a string",
            state_cmds,
        ),
        (
            "characters/default.toml",
            "vars = [",
            "not valid TOML",
            char_cmds,
        ),
        (
            "characters/default.toml",
            "vars = 3\n",
            "`vars` must be a table",
            char_cmds,
        ),
        (
            "characters/default.toml",
            "[vars]\nstr = \"x\"\n",
            "variable 'str' must be an integer",
            char_cmds,
        ),
        (
            "characters/default.toml",
            "[vars]\nstr = 1.5\n",
            "variable 'str' must be an integer",
            char_cmds,
        ),
        (
            "characters/default.toml",
            "presets = 3\n",
            "`presets` must be a table",
            char_cmds,
        ),
        (
            "characters/default.toml",
            "[presets]\natk = 3\n",
            "preset 'atk' must be a string",
            char_cmds,
        ),
    ];
    let grog = write_file(&cli, "characters/grog.toml", "");
    for (file, text, message, commands) in cases {
        let path = write_file(&cli, file, text);
        for args in commands {
            let run = cli.run(args);
            assert_eq!(run.code, 1, "{file} {text:?} {args:?}: {run:?}");
            assert!(
                run.stderr.contains(&path.display().to_string()) && run.stderr.contains(message),
                "{file} {text:?} {args:?}: {run:?}"
            );
            assert_eq!(std::fs::read_to_string(&path).unwrap(), text, "{args:?}");
        }
        std::fs::remove_file(&path).unwrap();
    }
    assert!(
        grog.exists(),
        "a failed delete must leave the character alone"
    );
}

#[test]
fn save_goes_to_the_active_character_and_presets_marks_the_source() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    let saved = cli.run(&["save", "atk", "d20+@str"]);
    saved.assert_success();
    assert_eq!(saved.stdout, "saved 'atk' on 'grog': d20+@str\n");
    assert_eq!(cli.run(&["presets"]).stdout, "atk  d20+@str  [grog]\n");
    let file =
        std::fs::read_to_string(cli.config_dir().join("rollin/characters/grog.toml")).unwrap();
    assert!(file.contains("atk = \"d20+@str\""), "{file}");
    assert!(!cli.config_dir().join("rollin/presets.toml").exists());
    let replaced = cli.run(&["save", "ATK", "d20+1"]);
    assert_eq!(
        replaced.stdout,
        "replaced 'atk' on 'grog' (was d20+@str): d20+1\n"
    );
}

#[test]
fn save_global_writes_the_global_file_from_anywhere_on_the_line() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    for args in [
        &["save", "--global", "gl", "d20"][..],
        &["save", "gl2", "d20+1", "--global"],
        &["save", "gl3", "--global", "d20+2"],
    ] {
        cli.run(args).assert_success();
    }
    let out = cli.run(&["save", "--global", "gl4", "d6"]);
    assert_eq!(out.stdout, "saved 'gl4': d6\n");
    let file = std::fs::read_to_string(cli.config_dir().join("rollin/presets.toml")).unwrap();
    assert!(
        file.contains("gl2 = \"d20+1\"") && file.contains("gl3 = \"d20+2\""),
        "{file}"
    );
    assert_eq!(
        cli.run(&["presets"]).stdout,
        "gl   d20    [global]\ngl2  d20+1  [global]\ngl3  d20+2  [global]\ngl4  d6     [global]\n"
    );
}

#[test]
fn a_character_preset_resolves_its_variables_when_rolled_not_when_saved() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    // Neither variable exists yet: saving still works.
    cli.run(&["save", "atk", "d20+@str+@prof"]).assert_success();
    let early = cli.run(&["atk"]);
    assert!(
        early
            .stderr
            .contains("undefined variable @str on character 'grog'"),
        "{early:?}"
    );
    cli.run(&["set", "str", "3"]).assert_success();
    cli.run(&["set", "prof", "2"]).assert_success();

    let by_name = cli.run(&["atk", "--seed", "9"]);
    by_name.assert_success();
    let direct = cli.run(&["d20+5", "--seed", "9"]);
    let header = "(preset 'atk': d20+@str+@prof)\n";
    assert!(by_name.stdout.starts_with(header), "{by_name:?}");
    let total = |out: &str| {
        out.lines()
            .last()
            .unwrap()
            .split_whitespace()
            .last()
            .unwrap()
            .to_string()
    };
    assert_eq!(total(&by_name.stdout), total(&direct.stdout));

    // Changing a variable changes the preset's roll.
    cli.run(&["set", "str", "10"]).assert_success();
    let quiet = |args: &[&str]| cli.run(args).stdout;
    assert_eq!(
        quiet(&["atk", "--seed", "9", "-q"]),
        quiet(&["d20+12", "--seed", "9", "-q"])
    );
    assert_eq!(
        quiet(&["roll", "atk", "--seed", "9", "-q"]),
        quiet(&["d20+12", "--seed", "9", "-q"])
    );
}

#[test]
fn a_character_preset_shadows_a_global_one_of_the_same_name_both_ways() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "atk", "d20"])
        .assert_success();
    cli.run(&["save", "--global", "only", "d6"])
        .assert_success();
    cli.run(&["char", "new", "grog"]).assert_success();
    cli.run(&["save", "atk", "d20+100"]).assert_success();

    let q = |args: &[&str]| cli.run(args).stdout;
    // On grog the character preset wins; the global one is still reachable by name elsewhere.
    assert!(q(&["atk", "--seed", "1"]).starts_with("(preset 'atk': d20+100)\n"));
    assert!(q(&["--char", "default", "atk", "--seed", "1"]).starts_with("(preset 'atk': d20)\n"));
    assert!(q(&["only", "--seed", "1"]).starts_with("(preset 'only': d6)\n"));
    assert_eq!(
        q(&["presets"]),
        "atk   d20+100  [grog, shadows global]\natk   d20      [global, shadowed by grog]\nonly  d6       [global]\n"
    );
    assert_eq!(
        q(&["--char", "default", "presets"]),
        "atk   d20  [global]\nonly  d6   [global]\n"
    );
}

#[test]
fn delete_removes_from_the_character_and_needs_global_for_global_presets() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "only", "d6"])
        .assert_success();
    cli.run(&["char", "new", "grog"]).assert_success();
    cli.run(&["save", "atk", "d20"]).assert_success();

    let removed = cli.run(&["delete", "ATK"]);
    removed.assert_success();
    assert_eq!(removed.stdout, "deleted 'atk' from 'grog'\n");
    assert_eq!(cli.run(&["presets"]).stdout, "only  d6  [global]\n");

    let global_only = cli.run(&["delete", "only"]);
    assert_eq!(global_only.code, 1, "{global_only:?}");
    assert_eq!(
        global_only.stderr,
        "error: no preset named 'only' on character 'grog'\nhint: it is a global preset; delete it with: rollin delete --global only\n"
    );
    assert!(cli.run(&["presets"]).stdout.contains("only"));

    let ghost = cli.run(&["delete", "ghost"]);
    assert_eq!(
        ghost.stderr,
        "error: no preset named 'ghost' on character 'grog'\n"
    );

    let global = cli.run(&["delete", "--global", "only"]);
    global.assert_success();
    assert_eq!(global.stdout, "deleted 'only'\n");
    let again = cli.run(&["delete", "only", "--global"]);
    assert_eq!(again.stderr, "error: no preset named 'only'\n");
    assert!(cli.run(&["presets"]).stdout.starts_with("No presets"));
}

#[test]
fn saving_a_formula_with_variables_ignores_errors_caused_by_the_stand_in_value() {
    let cli = Cli::new();
    for (name, formula) in [
        ("sides", "d@sides"),
        ("pool", "@n d@s!>@x"),
        ("keep", "@n d6kh@k"),
        ("rep", "@n x d20"),
        ("rerolls", "4d6rr<@x"),
        ("count", "6d10>=@dc f@fail"),
        ("mixed", "d20+@str, 2d6+@dmg # damage"),
    ] {
        cli.run(&["save", name, formula]).assert_success();
    }
    // Rolled for real, a bad value is reported then, against the real value.
    cli.run(&["set", "sides", "1"]).assert_success();
    let run = cli.run(&["sides"]);
    assert_eq!(
        run.stderr,
        "error: @sides is 1 but sides must be between 2 and 10000\n  d@sides\n   ^^^^^^\n"
    );
}

#[test]
fn saving_still_reports_real_syntax_errors_and_formulas_without_variables_stay_strict() {
    let cli = Cli::new();
    for (formula, stderr) in [
        ("d20+@str+", "error: expected a number, a dice group or '(', found end of input\n  d20+@str+\n           ^\n"),
        ("d20 @a", "error: expected ',' or the end of the formula, found variable @a\n  d20 @a\n      ^^\n"),
        ("@a @b", "error: expected ',' or the end of the formula, found variable @b\n  @a @b\n     ^^\n"),
        ("d1!", "error: sides must be between 2 and 10000\n  d1!\n   ^\n"),
        ("6d6!>0", "error: explosion condition '!>0' is true for every face of a d6, so it would never stop\n  6d6!>0\n     ^^^\n"),
        ("d6dl9", "error: cannot drop 9 dice from a pool of 1\n  d6dl9\n    ^^^\n"),
    ] {
        let run = cli.run(&["save", "bad", formula]);
        assert_eq!(run.code, 1, "{formula}: {run:?}");
        assert_eq!(run.stderr, stderr, "{formula}");
    }
    assert!(cli.run(&["presets"]).stdout.starts_with("No presets"));
}

#[test]
fn a_lone_word_near_a_character_preset_suggests_it() {
    let cli = Cli::new();
    cli.run(&["char", "new", "grog"]).assert_success();
    cli.run(&["save", "strike", "d20"]).assert_success();
    let run = cli.run(&["strik"]);
    assert_eq!(run.code, 1);
    assert_eq!(
        run.stderr,
        "error: 'strik' is not a valid formula or a known preset\nhint: did you mean 'strike'?\nhint: run `rollin presets` to list saved presets\n"
    );
    // Not visible from another character.
    let other = cli.run(&["--char", "default", "strike"]);
    assert!(
        other
            .stderr
            .contains("is not a valid formula or a known preset"),
        "{other:?}"
    );
    assert!(!other.stderr.contains("did you mean"), "{other:?}");
    cli.run(&["--char", "grog", "strike"]).assert_success();
}

#[test]
fn preset_commands_report_a_corrupt_state_or_character_file_and_leave_it_alone() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "g", "d6"]).assert_success();
    let state = write_file(&cli, "state.toml", "active = [");
    for args in [
        &["save", "x", "d6"][..],
        &["presets"],
        &["delete", "x"],
        &["g"],
    ] {
        let run = cli.run(args);
        assert_eq!(run.code, 1, "{args:?}: {run:?}");
        assert!(
            run.stderr.contains(&state.display().to_string()),
            "{args:?}: {run:?}"
        );
        assert!(run.stderr.contains("not valid TOML"), "{args:?}: {run:?}");
    }
    assert_eq!(std::fs::read_to_string(&state).unwrap(), "active = [");

    std::fs::write(&state, "active = \"default\"\n").unwrap();
    let character = write_file(&cli, "characters/default.toml", "vars = [");
    for args in [
        &["save", "x", "d6"][..],
        &["presets"],
        &["delete", "x"],
        &["g"],
    ] {
        let run = cli.run(args);
        assert_eq!(run.code, 1, "{args:?}: {run:?}");
        assert!(
            run.stderr.contains(&character.display().to_string()),
            "{args:?}: {run:?}"
        );
        assert!(run.stderr.contains("not valid TOML"), "{args:?}: {run:?}");
    }
    assert_eq!(std::fs::read_to_string(&character).unwrap(), "vars = [");
    // Global commands that never touch a character still work.
    cli.run(&["save", "--global", "h", "d8"]).assert_success();
    cli.run(&["delete", "--global", "h"]).assert_success();
}

#[test]
fn extreme_variable_values_overflow_as_clear_errors() {
    let cli = Cli::new();
    cli.run(&["set", "max", "9223372036854775807"])
        .assert_success();
    cli.run(&["set", "min", "-9223372036854775808"])
        .assert_success();
    assert_error(
        &cli,
        "d20+@max",
        "error: arithmetic overflow\n  d20+@max\n  ^^^^^^^^\n",
    );
    assert_error(
        &cli,
        "(-@min)",
        "error: arithmetic overflow\n  (-@min)\n   ^^^^^\n",
    );
    assert_error(&cli, "@max d6", "error: dice per term cap (1000) exceeded by '@max d6' (@max is 9223372036854775807)\n  @max d6\n  ^^^^\n");
    let run = cli.run(&["@max", "--json", "--seed", "1"]);
    run.assert_success();
    assert_eq!(run.json()["rolls"][0]["total"], 9223372036854775807_i64);
}

#[test]
fn import_accepts_formulas_that_use_variables() {
    let cli = Cli::new();
    let path = cli.config_dir().join("in.json");
    std::fs::write(&path, r#"{"atk": "d20+@str", "bad": "d20+"}"#).unwrap();
    let run = cli.run(&["import", path.to_str().unwrap()]);
    assert!(run.stdout.contains("imported 1, skipped 1"), "{run:?}");
    assert!(cli.run(&["presets"]).stdout.contains("d20+@str"));
}

#[test]
fn character_names_that_are_paths_are_rejected_everywhere_and_touch_no_file() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "g", "d6"]).assert_success();
    cli.run(&["char", "new", "grog"]).assert_success();
    let presets = cli.config_dir().join("rollin/presets.toml");
    let before = std::fs::read_to_string(&presets).unwrap();
    for bad in ["../presets", "..", "a/b", "My Char", "Ünï"] {
        for args in [
            vec!["char", bad],
            vec!["char", "delete", bad],
            vec!["--char", bad, "vars"],
            vec!["--char", bad, "set", "x", "1"],
        ] {
            let run = cli.run(&args);
            assert_eq!(run.code, 1, "{args:?}: {run:?}");
            assert_eq!(
                run.stderr,
                format!("error: invalid character name '{bad}': names must start with a letter and use only letters, digits, '_' or '-'\n"),
                "{args:?}"
            );
        }
    }
    assert_eq!(std::fs::read_to_string(&presets).unwrap(), before);
    assert_eq!(cli.run(&["char"]).stdout, "active character: grog\n");
}

#[test]
fn a_state_file_naming_a_path_is_a_wrong_typed_state_error() {
    let cli = Cli::new();
    cli.run(&["save", "--global", "g", "d6"]).assert_success();
    cli.run(&["char", "new", "grog"]).assert_success();
    let state = write_file(&cli, "state.toml", "active = \"../presets\"\n");
    for args in [
        &["vars"][..],
        &["d20"],
        &["characters"],
        &["char", "delete", "grog"],
    ] {
        let run = cli.run(args);
        assert_eq!(run.code, 1, "{args:?}: {run:?}");
        assert!(run.stderr.contains(&state.display().to_string()), "{run:?}");
        assert!(
            run.stderr
                .contains("`active` must be a valid character name"),
            "{run:?}"
        );
    }
    assert!(cli.config_dir().join("rollin/presets.toml").exists());
}

#[test]
fn files_in_the_characters_directory_with_odd_names_are_not_characters() {
    let cli = Cli::new();
    write_file(&cli, "characters/My Char.toml", "");
    write_file(&cli, "characters/grog.toml", "");
    write_file(&cli, "characters/notes.txt", "");
    assert_eq!(cli.run(&["characters"]).stdout, "* default\n  grog\n");
}
