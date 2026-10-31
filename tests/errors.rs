//! Typed errors: the CLI underlines the offending span on stderr.

mod common;

use common::Cli;

/// Runs a formula expected to fail and returns its stderr.
#[track_caller]
fn failure(formula: &str) -> String {
    let run = Cli::new().run(&["--seed", "1", "--", formula]);
    assert!(!run.success(), "{formula:?} should fail: {run:?}");
    assert!(run.stdout.is_empty(), "{formula:?}: {run:?}");
    assert!(!run.stderr.contains("panicked"), "{formula:?}: {run:?}");
    run.stderr
}

#[test]
fn a_syntax_error_underlines_where_the_formula_went_wrong() {
    assert_eq!(
        failure("d20+"),
        "error: expected a number, a dice group or '(', found end of input\n  d20+\n      ^\n"
    );
    assert_eq!(
        failure("d20 $ 5"),
        "error: unexpected character '$'\n  d20 $ 5\n      ^\n"
    );
    assert_eq!(
        failure("2d6 xyz"),
        "error: expected ',' or the end of the formula, found 'xyz'\n  2d6 xyz\n      ^^^\n"
    );
}

#[test]
fn an_unclosed_parenthesis_points_at_the_opening_one() {
    assert_eq!(
        failure("2*(d20+5"),
        "error: unclosed '('\n  2*(d20+5\n    ^\n"
    );
    assert_eq!(
        failure("d20+5)"),
        "error: expected ',' or the end of the formula, found ')'\n  d20+5)\n       ^\n"
    );
}

#[test]
fn dividing_by_zero_underlines_the_divisor() {
    assert_eq!(failure("1/0"), "error: division by zero\n  1/0\n    ^\n");
    assert_eq!(
        failure("d20 / (3-3)"),
        "error: division by zero\n  d20 / (3-3)\n        ^^^^^\n"
    );
}

#[test]
fn overflow_underlines_the_operation_that_overflowed() {
    assert_eq!(
        failure("9223372036854775807*2"),
        "error: arithmetic overflow\n  9223372036854775807*2\n  ^^^^^^^^^^^^^^^^^^^^^\n"
    );
    assert_eq!(
        failure("0 + 1 + 9223372036854775807 + 1"),
        "error: arithmetic overflow\n  0 + 1 + 9223372036854775807 + 1\n  ^^^^^^^^^^^^^^^^^^^^^^^^^^^\n"
    );
    // i64::MIN / -1 does not fit either.
    assert_eq!(
        failure("(0-9223372036854775807-1)/-1"),
        "error: arithmetic overflow\n  (0-9223372036854775807-1)/-1\n  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n"
    );
}

#[test]
fn errors_in_a_later_item_point_into_the_whole_formula() {
    assert_eq!(
        failure("d20, 4/0"),
        "error: division by zero\n  d20, 4/0\n         ^\n"
    );
}

#[test]
fn v1_rejections_still_fail_with_a_span() {
    assert_eq!(
        failure("2d6dl9"),
        "error: cannot drop 9 dice from a pool of 2\n  2d6dl9\n     ^^^\n"
    );
    assert_eq!(
        failure("1d1"),
        "error: sides must be between 2 and 10000\n  1d1\n    ^\n"
    );
    assert_eq!(
        failure("99999999999999999999d6"),
        "error: number is too large\n  99999999999999999999d6\n  ^^^^^^^^^^^^^^^^^^^^\n"
    );
}

#[test]
fn too_many_dice_in_a_term_names_the_cap_and_the_term() {
    assert_eq!(
        failure("2+1001d6"),
        "error: dice per term cap (1000) exceeded by '1001d6'\n  2+1001d6\n    ^^^^\n"
    );
    Cli::new().run(&["1000d6", "--seed", "1"]).assert_success();
}

#[test]
fn too_many_dice_in_an_expression_names_the_cap_and_the_term() {
    let ten = vec!["1000d6"; 10].join("+");
    let cli = Cli::new();
    cli.run(&[&ten, "--seed", "1"]).assert_success();
    // The cap is per roll: the same ten groups in two comma items are fine.
    cli.run(&[&format!("{ten}, {ten}"), "--seed", "1"])
        .assert_success();

    let eleven = format!("{ten}+1d4");
    let stderr = failure(&eleven);
    let first_line = stderr.lines().next().unwrap();
    assert_eq!(
        first_line,
        "error: dice per expression cap (10000) exceeded by '1d4'"
    );
    // The caret sits under the term that went over.
    let caret_col = stderr.lines().nth(2).unwrap().find('^').unwrap();
    assert_eq!(caret_col, 2 + ten.len() + 1);
}

#[test]
fn nesting_deeper_than_32_is_an_error() {
    let nest = |n: usize| format!("{}d20{}", "(".repeat(n), ")".repeat(n));
    let cli = Cli::new();
    cli.run(&[&nest(32), "--seed", "1"]).assert_success();

    let stderr = failure(&nest(33));
    assert_eq!(
        stderr.lines().next().unwrap(),
        "error: nesting depth cap (32) exceeded by '(d20))))))))))))…'"
    );
    // The caret is under the 33rd opening parenthesis.
    assert_eq!(
        stderr.lines().nth(2).unwrap(),
        format!("  {}^", " ".repeat(32))
    );

    // Unary minus nests too.
    cli.run(&["--seed", "1", "--", &format!("{}d20", "-".repeat(32))])
        .assert_success();
    failure(&format!("{}d20", "-".repeat(33)));
}

#[test]
fn very_long_flat_formulas_do_not_overflow_the_stack() {
    let cli = Cli::new();
    let long = vec!["1"; 200_000].join("+");
    let run = cli.run(&[&long, "--seed", "1"]);
    run.assert_success();
    assert!(run.stdout.ends_with("→  200000\n"), "{}", run.stdout.len());
}
