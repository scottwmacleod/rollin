//! The session's pure pieces, tested through the library API: prompt text and
//! completion.

mod common;
use common::Cli;
use rollin::Context;

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
