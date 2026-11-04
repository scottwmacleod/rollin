//! `rollin::check`: validating a formula without rolling it.
//!
//! The contract is that `check` fails exactly as rolling would, so each error
//! case compares the two results whole (message, span, hint and the extra
//! details of an undefined variable), and then pins a few by value.

use rollin::{
    check, execute, parse_command, Command, CommandError, Context, Error, Name, UndefinedVariable,
};
use std::collections::BTreeMap;
use std::path::Path;
use tempfile::TempDir;

/// A context over an empty temporary config directory.
fn sandbox() -> (TempDir, Context) {
    let dir = TempDir::new().unwrap();
    let ctx = Context::new(Some(dir.path().to_path_buf()));
    (dir, ctx)
}

fn run(ctx: &Context, command: Command) {
    let mut rng = rollin::seeded_rng(1);
    execute(&command, ctx, &mut rng).unwrap();
}

fn set(ctx: &Context, name: &str, value: i64) {
    run(
        ctx,
        Command::Set {
            name: name.into(),
            value,
        },
    );
}

fn save(ctx: &Context, name: &str, formula: &str, global: bool) {
    run(
        ctx,
        Command::Save {
            name: name.into(),
            formula: formula.into(),
            global,
        },
    );
}

/// What rolling `formula` from the command line gives, as an error.
#[track_caller]
fn rolled_error(ctx: &Context, formula: &str) -> CommandError {
    let words = [formula.to_string()];
    let command = match parse_command(&words, &mut || ctx.preset_names()) {
        Ok(command) => command,
        Err(e) => return e,
    };
    let mut rng = rollin::seeded_rng(1);
    execute(&command, ctx, &mut rng).expect_err(&format!("{formula:?} should fail"))
}

/// Asserts `check` fails with exactly the error rolling gives.
#[track_caller]
fn same_failure(ctx: &Context, formula: &str) -> CommandError {
    let checked = check(formula, ctx).expect_err(&format!("{formula:?} should not check"));
    assert_eq!(checked, rolled_error(ctx, formula), "{formula:?}");
    checked
}

#[track_caller]
fn formula_error(e: &CommandError) -> &Error {
    match e {
        CommandError::Formula { error, .. } => error,
        other => panic!("not a formula error: {other:?}"),
    }
}

/// Every file under `dir` with its contents.
fn snapshot(dir: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let name = path.strip_prefix(root).unwrap().display().to_string();
            if path.is_dir() {
                out.insert(format!("{name}/"), Vec::new());
                walk(root, &path, out);
            } else {
                out.insert(name, std::fs::read(&path).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(dir, dir, &mut out);
    out
}

#[test]
fn every_error_formula_fails_the_way_rolling_does() {
    let (_dir, ctx) = sandbox();
    let ten = ["1000d6"; 10].join("+");
    let nest = |n: usize| format!("{}d20{}", "(".repeat(n), ")".repeat(n));
    let formulas = [
        "d20+",
        "d20 $ 5",
        "2d6 xyz",
        "2*(d20+5",
        "d20+5)",
        "1/0",
        "d20 / (3-3)",
        "9223372036854775807*2",
        "0 + 1 + 9223372036854775807 + 1",
        "(0-9223372036854775807-1)/-1",
        "d20, 4/0",
        "2d6dl9",
        "1d1",
        "99999999999999999999d6",
        "2+1001d6",
        "2x3",
        "3x5+2",
        "2x 3, 4",
        "0x d6",
        "d6!>=1",
        "d6rr>=1",
        "(4d6>=5)+1",
        "",
        "   ",
        "# only a label",
    ];
    for formula in formulas {
        same_failure(&ctx, formula);
    }
    same_failure(&ctx, &format!("{ten}+1d4"));
    same_failure(&ctx, &nest(33));
    same_failure(&ctx, &format!("{}d20", "-".repeat(33)));
}

#[test]
fn spans_and_messages_are_the_ones_the_cli_underlines() {
    let (_dir, ctx) = sandbox();
    let e = same_failure(&ctx, "d20 / (3-3)");
    assert_eq!(formula_error(&e).message(), "division by zero");
    assert_eq!(formula_error(&e).span(), 6..11);

    let e = same_failure(&ctx, "d20, 4/0");
    assert_eq!(formula_error(&e).span(), 7..8);

    let e = same_failure(&ctx, "9223372036854775807*2");
    assert_eq!(formula_error(&e).message(), "arithmetic overflow");
    assert_eq!(formula_error(&e).span(), 0..21);

    let e = same_failure(&ctx, "d20+");
    assert_eq!(
        formula_error(&e).message(),
        "expected a number, a dice group or '(', found end of input"
    );
    assert_eq!(formula_error(&e).span(), 4..4);
}

#[test]
fn a_repeat_of_plain_numbers_keeps_its_multiplication_hint() {
    let (_dir, ctx) = sandbox();
    let e = same_failure(&ctx, "2x3");
    assert_eq!(
        formula_error(&e).hints(),
        vec![rollin::Hint::UseMultiplication {
            suggestion: Some("2*3".into())
        }]
    );
}

#[test]
fn a_division_by_zero_beside_dice_is_found_without_rolling() {
    let (_dir, ctx) = sandbox();
    set(&ctx, "zero", 0);
    let e = same_failure(&ctx, "d20/0");
    assert_eq!(formula_error(&e).span(), 4..5);
    same_failure(&ctx, "(d20+1)/@zero");
    same_failure(&ctx, "d20/(@zero*5)");
    same_failure(&ctx, "-(d6/0)");
}

#[test]
fn an_undefined_variable_carries_the_same_details_as_rolling() {
    let (_dir, ctx) = sandbox();
    set(&ctx, "str", 3);
    set(&ctx, "dex", 2);
    let e = same_failure(&ctx, "d20+@stre");
    let CommandError::UndefinedVariable(u) = e else {
        panic!("expected an undefined variable: {e:?}");
    };
    let UndefinedVariable {
        name,
        defined,
        suggestion,
        character,
        explicit,
        error,
        ..
    } = *u;
    assert_eq!(name, "stre");
    assert_eq!(defined, ["dex", "str"]);
    assert_eq!(suggestion.as_deref(), Some("str"));
    assert_eq!(character, "default");
    assert!(!explicit);
    assert_eq!(error.span(), 4..9);
}

#[test]
fn a_variable_in_a_failing_term_names_its_value_like_rolling() {
    let (_dir, ctx) = sandbox();
    set(&ctx, "s", 1);
    let e = same_failure(&ctx, "1d@s");
    assert_eq!(
        formula_error(&e).message(),
        "@s is 1 but sides must be between 2 and 10000"
    );
}

#[test]
fn a_char_override_is_checked_against_that_character() {
    let (_dir, mut ctx) = sandbox();
    run(&ctx, Command::CharNew("grog".into()));
    set(&ctx, "rage", 2);
    run(&ctx, Command::CharSwitch(Name::shaped("default").unwrap()));
    assert!(check("d20+@rage", &ctx).is_err());
    ctx.character = Some("grog".into());
    check("d20+@rage", &ctx).unwrap();

    ctx.character = Some("nobody".into());
    same_failure(&ctx, "d20");
}

#[test]
fn valid_formulas_check_ok() {
    let (_dir, ctx) = sandbox();
    set(&ctx, "str", 3);
    for formula in [
        "d20",
        "d20+5",
        "4d6dl1",
        "d20adv",
        "6d10>=8f1",
        "d6!",
        "d20 + @str",
        "4d6dl1, d20+@STR # attack",
        "6x 4d6dl1",
        "3x d20+@str # attack, d6",
        "d%",
        "d20 / 2 * (3 - 1)",
        "d20, ,d6,",
        "9223372036854775807+0",
    ] {
        check(formula, &ctx).unwrap_or_else(|e| panic!("{formula:?}: {e}"));
    }
}

#[test]
fn presets_check_through_their_formula() {
    let (_dir, ctx) = sandbox();
    set(&ctx, "str", 3);
    save(&ctx, "atk", "d20+@str", false);
    save(&ctx, "fireball", "8d6", true);
    save(&ctx, "stats", "6x 4d6dl1", true);
    check("atk", &ctx).unwrap();
    check("ATK", &ctx).unwrap();
    check("fireball", &ctx).unwrap();
    check("stats", &ctx).unwrap();
}

#[test]
fn a_preset_whose_variable_is_gone_fails_like_rolling_it() {
    let (_dir, ctx) = sandbox();
    set(&ctx, "str", 3);
    save(&ctx, "atk", "d20+@str", false);
    run(&ctx, Command::Unset { name: "str".into() });
    let e = same_failure(&ctx, "atk");
    assert!(matches!(e, CommandError::UndefinedVariable(_)), "{e:?}");
}

#[test]
fn an_unknown_preset_matches_the_cli_wording_and_suggestion() {
    let (_dir, ctx) = sandbox();
    save(&ctx, "attack", "d20", true);
    let e = same_failure(&ctx, "atack");
    assert_eq!(
        e,
        CommandError::UnknownPreset {
            word: "atack".into(),
            suggestion: Some("attack".into()),
        }
    );
    assert_eq!(
        e.to_string(),
        "'atack' is not a valid formula or a known preset"
    );
    let e = same_failure(&ctx, "nosuch");
    assert!(matches!(
        e,
        CommandError::UnknownPreset {
            suggestion: None,
            ..
        }
    ));
}

#[test]
fn checking_never_rolls_or_writes() {
    let (dir, ctx) = sandbox();
    // An empty config directory stays empty, whatever is checked.
    for formula in ["d20", "bogus", "d20+@x", "1/0", "3x d6"] {
        let _ = check(formula, &ctx);
    }
    assert!(
        snapshot(dir.path()).is_empty(),
        "{:?}",
        snapshot(dir.path())
    );

    set(&ctx, "str", 3);
    save(&ctx, "atk", "d20+@str", false);
    save(&ctx, "fireball", "8d6", true);
    let before = snapshot(dir.path());
    assert!(!before.is_empty());
    for formula in ["atk", "fireball", "d20+@str", "d20+@nope", "ghost", "1/0"] {
        let _ = check(formula, &ctx);
    }
    assert_eq!(snapshot(dir.path()), before);
}

#[test]
fn a_context_without_a_config_dir_fails_like_rolling() {
    let ctx = Context::new(None);
    same_failure(&ctx, "d20");
}

#[test]
fn a_very_long_flat_formula_does_not_overflow_the_stack() {
    let (_dir, ctx) = sandbox();
    let long = vec!["1"; 200_000].join("+");
    check(&long, &ctx).unwrap();
}
