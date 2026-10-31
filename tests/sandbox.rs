//! The test harness must keep every spawned `rollin` away from the real
//! config directory, even when a test drops `XDG_CONFIG_HOME` on purpose.
//! (Stray `rollin/presets.toml` and `.config/rollin/presets.toml` once got
//! committed from the repo root; see tests/common/mod.rs.)

mod common;

use common::Cli;
use std::path::PathBuf;

/// The file a HOME-relative `rollin save` would write for the real user.
fn real_presets_file() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").expect("HOME is set for tests"))
        .join(".config/rollin/presets.toml")
}

#[test]
fn a_run_without_xdg_config_home_writes_under_the_sandbox_home_not_the_real_one() {
    let before = std::fs::read(real_presets_file()).ok();
    let cli = Cli::new();
    cli.run_without_xdg(&["save", "--global", "guard", "d6"])
        .assert_success();
    assert_eq!(
        std::fs::read(real_presets_file()).ok(),
        before,
        "the real ~/.config/rollin/presets.toml changed"
    );
    assert!(
        cli.home_dir().join(".config/rollin/presets.toml").is_file(),
        "the sandbox HOME did not receive the write"
    );
}
