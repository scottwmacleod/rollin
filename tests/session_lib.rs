//! The session's pure pieces, tested through the library API: prompt text and
//! completion.

mod common;
use common::Cli;
use rollin::{Context, LinePolicy};

#[test]
fn the_prompt_names_the_active_character_unless_it_is_default() {
    let cli = Cli::new();
    let ctx = Context::new(Some(cli.config_dir().to_path_buf()));
    assert_eq!(ctx.prompt(), "rollin> ");
    cli.run(&["char", "new", "grog"]).assert_success();
    assert_eq!(ctx.prompt(), "rollin[grog]> ");
    cli.run(&["char", "default"]).assert_success();
    assert_eq!(ctx.prompt(), "rollin> ");
}

#[test]
fn a_broken_active_character_setting_falls_back_to_the_plain_prompt() {
    let cli = Cli::new();
    std::fs::create_dir_all(cli.config_dir().join("rollin")).unwrap();
    std::fs::write(cli.config_dir().join("rollin").join("state.toml"), "[[[").unwrap();
    let ctx = Context::new(Some(cli.config_dir().to_path_buf()));
    assert_eq!(ctx.prompt(), "rollin> ");
    assert_eq!(Context::new(None).prompt(), "rollin> ");
}

#[test]
fn completion_data_lists_what_the_active_character_can_reach() {
    let cli = Cli::new();
    for args in [
        &["save", "--global", "house", "d6"][..],
        &["save", "--global", "atk", "d20"],
        &["char", "new", "grog"],
        &["save", "sneak", "d20+@dex"],
        &["save", "atk", "d20+@str"],
        &["set", "str", "5"],
        &["set", "dex", "2"],
    ] {
        cli.run(args).assert_success();
    }
    let data = Context::new(Some(cli.config_dir().to_path_buf())).completion_data(LinePolicy::REPL);
    // The character's own presets first, then global ones, no repeats.
    assert_eq!(data.presets, ["atk", "sneak", "house"]);
    assert_eq!(data.characters, ["default", "grog"]);
    assert_eq!(data.variables, ["dex", "str"]);
    assert_eq!(data.session_words, ["help", "quit", "exit", "history"]);
}

#[test]
fn completion_data_ignores_load_errors_without_failing() {
    let cli = Cli::new();
    cli.run(&["set", "str", "5"]).assert_success();
    let dir = cli.config_dir().join("rollin");
    std::fs::write(dir.join("presets.toml"), "[[[").unwrap();
    let data = Context::new(Some(cli.config_dir().to_path_buf())).completion_data(LinePolicy::REPL);
    assert_eq!(data.presets, Vec::<String>::new());
    assert_eq!(data.variables, ["str"]);
    let none = Context::new(None).completion_data(LinePolicy::REPL);
    assert!(none.presets.is_empty() && none.characters.is_empty() && none.variables.is_empty());
    assert_eq!(none.session_words, ["help", "quit", "exit", "history"]);
}
