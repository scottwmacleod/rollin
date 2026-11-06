//! The `system` setting through the CLI seam: character key, global default,
//! precedence, and how a crit reads in the output.

mod common;

use common::Cli;
use rollin::{roll, seeded_rng, Natural};

/// The first seed whose `d20, 1d8` rolls a natural 20 (or 1) on the d20.
fn seed_with(natural: Natural) -> String {
    (0..5000u64)
        .find(|&s| roll("d20, 1d8", &mut seeded_rng(s)).unwrap()[0].natural() == Some(natural))
        .expect("a seed with the wanted natural")
        .to_string()
}

fn write(cli: &Cli, file: &str, text: &str) {
    let path = cli.config_dir().join("rollin").join(file);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn roll_json(cli: &Cli, extra: &[&str], seed: &str) -> serde_json::Value {
    let mut args = vec!["d20, 1d8", "--seed", seed, "--json"];
    args.extend_from_slice(extra);
    let run = cli.run(&args);
    run.assert_success();
    run.json()
}

#[test]
fn no_system_means_no_crit() {
    let cli = Cli::new();
    let json = roll_json(&cli, &[], &seed_with(Natural::Twenty));
    assert!(json["rolls"][0].get("crit").is_none());
    assert!(json["rolls"][1].get("doubled").is_none());
}

#[test]
fn a_character_system_applies() {
    let cli = Cli::new();
    write(&cli, "characters/grog.toml", "system = \"dnd5e\"\n");
    let json = roll_json(&cli, &["--char", "grog"], &seed_with(Natural::Twenty));
    assert_eq!(json["rolls"][0]["crit"], "hit");
    assert_eq!(json["rolls"][1]["doubled"], true);
    // Another character is unaffected.
    let json = roll_json(&cli, &[], &seed_with(Natural::Twenty));
    assert!(json["rolls"][0].get("crit").is_none());
}

#[test]
fn the_global_default_applies_to_every_character() {
    let cli = Cli::new();
    write(&cli, "settings.toml", "system = \"dnd5e\"\n");
    let json = roll_json(&cli, &[], &seed_with(Natural::One));
    assert_eq!(json["rolls"][0]["crit"], "miss");
    assert!(json["rolls"][1].get("doubled").is_none());
}

#[test]
fn a_hand_edited_value_is_case_insensitive() {
    let cli = Cli::new();
    write(&cli, "settings.toml", "system = \"DnD5e\"\n");
    let json = roll_json(&cli, &[], &seed_with(Natural::Twenty));
    assert_eq!(json["rolls"][0]["crit"], "hit");
}

#[test]
fn a_bad_system_value_is_an_error_naming_the_file() {
    let cli = Cli::new();
    write(&cli, "characters/grog.toml", "system = \"pf2e\"\n");
    let run = cli.run(&["d20", "--char", "grog"]);
    assert!(!run.success());
    assert!(run.stderr.contains("grog.toml"), "{}", run.stderr);
    assert!(
        run.stderr.contains("`system` must be one of"),
        "{}",
        run.stderr
    );
}

#[test]
fn a_character_file_keeps_its_system_through_a_save() {
    let cli = Cli::new();
    write(
        &cli,
        "characters/grog.toml",
        "# Grog\nsystem = \"dnd5e\" # the table's rules\n",
    );
    cli.run(&["--char", "grog", "set", "str", "3"])
        .assert_success();
    let text =
        std::fs::read_to_string(cli.config_dir().join("rollin/characters/grog.toml")).unwrap();
    assert!(
        text.contains("system = \"dnd5e\" # the table's rules"),
        "{text}"
    );
    assert!(text.contains("str = 3"), "{text}");
}

#[test]
fn the_cli_says_critical_hit_and_doubled_dice() {
    let cli = Cli::new();
    write(&cli, "settings.toml", "system = \"dnd5e\"\n");
    let seed = seed_with(Natural::Twenty);
    let run = cli.run(&["d20, 1d8", "--seed", &seed, "--color", "never"]);
    run.assert_success();
    let lines: Vec<&str> = run.stdout.lines().collect();
    assert!(lines[0].contains("CRITICAL HIT"), "{}", run.stdout);
    assert!(lines[1].contains("(dice doubled)"), "{}", run.stdout);
    let seed = seed_with(Natural::One);
    let run = cli.run(&["d20, 1d8", "--seed", &seed, "--color", "never"]);
    assert!(run.stdout.lines().next().unwrap().contains("CRITICAL MISS"));
    assert!(!run.stdout.contains("doubled"));
}
