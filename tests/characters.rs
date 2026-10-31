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
                .map(|r| (r["total"].clone(), common::flat_dice(&r["expr"]).into()))
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
