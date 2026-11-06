//! `rollin::sample`: rolling a formula for a preview, without logging it.

use rollin::{execute, parse_command, sample, Command, Context, Output};
use std::path::Path;
use tempfile::TempDir;

fn sandbox() -> (TempDir, Context) {
    let dir = TempDir::new().unwrap();
    let ctx = Context::new(Some(dir.path().to_path_buf()));
    (dir, ctx)
}

fn run(ctx: &Context, command: Command) {
    execute(&command, ctx, &mut rollin::seeded_rng(1)).unwrap();
}

/// Every file under `dir` with its contents.
fn snapshot(dir: &Path) -> Vec<(String, Vec<u8>)> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for entry in std::fs::read_dir(d).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                stack.push(path);
            } else {
                let name = path.strip_prefix(dir).unwrap().display().to_string();
                out.push((name, std::fs::read(&path).unwrap()));
            }
        }
    }
    out.sort();
    out
}

#[test]
fn rolls_what_rolling_the_same_text_rolls() {
    let (_dir, ctx) = sandbox();
    let sampled = sample("2d20kh1+5", &ctx, &mut rollin::seeded_rng(7)).unwrap();
    let command = parse_command(&["2d20kh1+5".to_string()], &mut || ctx.preset_names()).unwrap();
    let Output::Rolls { rolls, .. } = execute(&command, &ctx, &mut rollin::seeded_rng(7)).unwrap()
    else {
        panic!("a roll gives Rolls");
    };
    assert_eq!(sampled, rolls);
}

#[test]
fn resolves_variables_and_preset_names() {
    let (_dir, ctx) = sandbox();
    run(
        &ctx,
        Command::Set {
            name: "prof".into(),
            value: 3,
        },
    );
    run(
        &ctx,
        Command::Save {
            name: "hit".into(),
            formula: "10+@prof".into(),
            global: false,
        },
    );
    let rolls = sample("hit", &ctx, &mut rollin::seeded_rng(1)).unwrap();
    assert_eq!(rolls[0].total, 13);
    let rolls = sample("10+@prof", &ctx, &mut rollin::seeded_rng(1)).unwrap();
    assert_eq!(rolls[0].total, 13);
}

#[test]
fn fails_as_rolling_does() {
    let (_dir, ctx) = sandbox();
    for formula in ["d20+", "1/0", "d20+@nope", ""] {
        let sampled = sample(formula, &ctx, &mut rollin::seeded_rng(1)).unwrap_err();
        let words = [formula.to_string()];
        let rolled = match parse_command(&words, &mut || ctx.preset_names()) {
            Ok(command) => execute(&command, &ctx, &mut rollin::seeded_rng(1)).unwrap_err(),
            Err(e) => e,
        };
        assert_eq!(sampled, rolled, "{formula:?}");
    }
}

#[test]
fn writes_nothing() {
    let (dir, ctx) = sandbox();
    run(
        &ctx,
        Command::Save {
            name: "hit".into(),
            formula: "d20".into(),
            global: false,
        },
    );
    let before = snapshot(dir.path());
    let _ = sample("hit", &ctx, &mut rollin::seeded_rng(1));
    let _ = sample("d20+", &ctx, &mut rollin::seeded_rng(1));
    assert_eq!(snapshot(dir.path()), before);
}
