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
