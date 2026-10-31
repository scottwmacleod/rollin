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
