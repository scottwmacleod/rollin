//! Hand-written comments, ordering and formatting in the TOML data files
//! survive saves (ADR 0004), at the CLI seam.

mod common;

use common::Cli;
use std::path::PathBuf;

/// Writes `text` as `rollin/<file>` in the config dir and returns its path.
fn write(cli: &Cli, file: &str, text: &str) -> PathBuf {
    let path = cli.config_dir().join("rollin").join(file);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, text).unwrap();
    path
}

const PRESETS: &str = "\
# My table's presets -- edited by hand.

[presets]
# the big hit
zap   = 'd20+8'   # single-quoted on purpose
atk = \"2d6+3\"

# last, on purpose
dmg = \"d8\"
";

#[test]
fn saving_a_preset_appends_it_and_leaves_hand_written_text_alone() {
    let cli = Cli::new();
    let path = write(&cli, "presets.toml", PRESETS);
    cli.run(&["save", "--global", "heal", "d4+2"])
        .assert_success();
    assert_eq!(
        std::fs::read_to_string(path).unwrap(),
        format!("{PRESETS}heal = \"d4+2\"\n")
    );
}

#[test]
fn deleting_a_preset_removes_only_its_own_line() {
    let cli = Cli::new();
    let path = write(&cli, "presets.toml", PRESETS);
    cli.run(&["delete", "--global", "atk"]).assert_success();
    assert_eq!(
        std::fs::read_to_string(path).unwrap(),
        PRESETS.replace("atk = \"2d6+3\"\n", "")
    );
}

#[test]
fn overwriting_a_preset_keeps_its_key_spacing_and_trailing_comment() {
    let cli = Cli::new();
    let path = write(&cli, "presets.toml", PRESETS);
    cli.run(&["save", "--global", "zap", "d20+9"])
        .assert_success();
    assert_eq!(
        std::fs::read_to_string(path).unwrap(),
        PRESETS.replace("'d20+8'   #", "\"d20+9\"   #")
    );
}

const GROG: &str = "\
# Grog the barbarian

[vars]
str = 18   # mighty
dex = 10

# his tricks
[presets]
rage = \"d20+@str\"   # only on a good day
";

#[test]
fn setting_a_variable_edits_the_character_file_in_place() {
    let cli = Cli::new();
    let path = write(&cli, "characters/grog.toml", GROG);
    cli.run(&["--char", "grog", "set", "con", "14"])
        .assert_success();
    cli.run(&["--char", "grog", "set", "dex", "12"])
        .assert_success();
    cli.run(&["--char", "grog", "unset", "str"])
        .assert_success();
    assert_eq!(
        std::fs::read_to_string(path).unwrap(),
        GROG.replace("str = 18   # mighty\n", "")
            .replace("dex = 10", "dex = 12\ncon = 14")
    );
}

#[test]
fn saving_a_character_preset_keeps_vars_and_presets_text() {
    let cli = Cli::new();
    let path = write(&cli, "characters/grog.toml", GROG);
    cli.run(&["--char", "grog", "save", "smash", "2d8+@str"])
        .assert_success();
    cli.run(&["--char", "grog", "delete", "rage"])
        .assert_success();
    assert_eq!(
        std::fs::read_to_string(path).unwrap(),
        GROG.replace(
            "rage = \"d20+@str\"   # only on a good day\n",
            "smash = \"2d8+@str\"\n"
        )
    );
}

#[test]
fn switching_character_edits_the_state_file_in_place() {
    let cli = Cli::new();
    write(&cli, "characters/grog.toml", GROG);
    let path = write(
        &cli,
        "state.toml",
        "# which sheet is open\nactive = \"default\"   # for now\n",
    );
    cli.run(&["char", "grog"]).assert_success();
    assert_eq!(
        std::fs::read_to_string(path).unwrap(),
        "# which sheet is open\nactive = \"grog\"   # for now\n"
    );
}
