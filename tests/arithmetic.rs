//! Arithmetic between terms, through the CLI seam.

mod common;

use common::Cli;
use serde_json::Value;

/// Sum of the kept dice values directly inside a `dice` node.
fn kept_sum(node: &Value) -> i64 {
    node["dice"]
        .as_array()
        .expect("dice array")
        .iter()
        .filter(|d| d["status"] == "kept")
        .map(|d| d["value"].as_i64().unwrap())
        .sum()
}

#[test]
fn sums_dice_groups_and_numbers_with_each_term_in_the_tree() {
    let cli = Cli::new();
    let out = cli.roll_json("2d6+1d4+3", 7);
    let roll = &out["rolls"][0];
    assert_eq!(roll["formula"], "2d6+1d4+3");

    let expr = &roll["expr"];
    assert_eq!(expr["type"], "chain");
    let (first, rest) = (&expr["first"], expr["rest"].as_array().unwrap());
    assert_eq!(first["type"], "dice");
    assert_eq!(first["term"], "2d6");
    assert_eq!(first["dice"].as_array().unwrap().len(), 2);
    assert_eq!(first["subtotal"], kept_sum(first));
    assert_eq!(rest.len(), 2);
    assert_eq!(rest[0]["op"], "+");
    assert_eq!(rest[0]["node"]["term"], "1d4");
    assert_eq!(rest[0]["node"]["subtotal"], kept_sum(&rest[0]["node"]));
    assert_eq!(rest[1]["op"], "+");
    assert_eq!(rest[1]["node"], serde_json::json!({"type": "number", "value": 3}));

    let expected = first["subtotal"].as_i64().unwrap()
        + rest[0]["node"]["subtotal"].as_i64().unwrap()
        + 3;
    assert_eq!(roll["total"], expected);
    assert_eq!(expr["total"], expected);
}

#[test]
fn human_output_joins_each_groups_dice_with_the_operators() {
    let cli = Cli::new();
    let json = cli.roll_json("d20+d4-2", 5);
    let expr = &json["rolls"][0]["expr"];
    let a = expr["first"]["dice"][0]["value"].as_i64().unwrap();
    let b = expr["rest"][0]["node"]["dice"][0]["value"].as_i64().unwrap();
    let total = json["rolls"][0]["total"].as_i64().unwrap();

    let run = cli.run(&["d20+d4-2", "--seed", "5"]);
    run.assert_success();
    assert_eq!(
        run.stdout,
        format!("d20+d4-2  [{a}] + [{b}] - 2  →  {total}\n")
    );
}

/// Rolls a dice-free formula and returns its total.
#[track_caller]
fn total(cli: &Cli, formula: &str) -> i64 {
    let run = cli.run(&["--seed", "1", "--json", "--", formula]);
    run.assert_success();
    run.json()["rolls"][0]["total"].as_i64().expect("integer total")
}

#[test]
fn multiplication_and_division_bind_tighter_than_addition() {
    let cli = Cli::new();
    for (formula, expected) in [
        ("2+3*4", 14),
        ("2*3+4", 10),
        ("10-4/2", 8),
        ("10-4-3", 3),
        ("2*3*4", 24),
        ("100/5/2", 10),
        ("1+2*3-4/2+5", 10),
    ] {
        assert_eq!(total(&cli, formula), expected, "{formula}");
    }
}

#[test]
fn higher_precedence_operands_nest_as_their_own_chain() {
    let cli = Cli::new();
    let out = cli.roll_json("2+3*4", 1);
    let expr = &out["rolls"][0]["expr"];
    assert_eq!(expr["total"], 14);
    let product = &expr["rest"][0]["node"];
    assert_eq!(expr["rest"][0]["op"], "+");
    assert_eq!(product["type"], "chain");
    assert_eq!(product["rest"][0]["op"], "*");
    assert_eq!(product["total"], 12);
}

#[test]
fn integer_division_truncates_toward_zero() {
    let cli = Cli::new();
    for (formula, expected) in [("7/2", 3), ("-7/2", -3), ("7/-2", -3), ("-7/-2", 3)] {
        assert_eq!(total(&cli, formula), expected, "{formula}");
    }
}

#[test]
fn dice_multiply_and_divide() {
    let cli = Cli::new();
    let out = cli.roll_json("d20*2", 4);
    let roll = &out["rolls"][0];
    let die = roll["expr"]["first"]["dice"][0]["value"].as_i64().unwrap();
    assert_eq!(roll["total"], die * 2);
    let run = cli.run(&["d20*2", "--seed", "4"]);
    assert_eq!(run.stdout, format!("d20*2  [{die}] * 2  →  {}\n", die * 2));
}

#[test]
fn parentheses_override_precedence() {
    let cli = Cli::new();
    for (formula, expected) in [
        ("(2+3)*4", 20),
        ("2*(3+4)*5", 70),
        ("((2+3))", 5),
        ("-(2+3)", -5),
        ("-(2+3)*-2", 10),
        ("10-(4-3)", 9),
        ("( 8 / ( 1 + 1 ) )", 4),
    ] {
        assert_eq!(total(&cli, formula), expected, "{formula}");
    }
}

#[test]
fn a_parenthesised_dice_sum_is_a_group_in_the_tree_and_the_output() {
    let cli = Cli::new();
    let out = cli.roll_json("(d20+5)*2", 3);
    let roll = &out["rolls"][0];
    let group = &roll["expr"]["first"];
    assert_eq!(group["type"], "group");
    let die = group["inner"]["first"]["dice"][0]["value"].as_i64().unwrap();
    assert_eq!(group["total"], die + 5);
    assert_eq!(roll["total"], (die + 5) * 2);

    let run = cli.run(&["(d20+5)*2", "--seed", "3"]);
    assert_eq!(
        run.stdout,
        format!("(d20+5)*2  ([{die}] + 5) * 2  →  {}\n", (die + 5) * 2)
    );
}

#[test]
fn unary_minus_applies_to_dice_and_numbers() {
    let cli = Cli::new();
    let out = cli.roll_json("10 + -d6", 2);
    let roll = &out["rolls"][0];
    let die = roll["expr"]["rest"][0]["node"]["operand"]["dice"][0]["value"]
        .as_i64()
        .unwrap();
    assert_eq!(roll["total"], 10 - die);
    let run = cli.run(&["10 + -d6", "--seed", "2"]);
    assert_eq!(run.stdout, format!("10 + -d6  10 + -[{die}]  →  {}\n", 10 - die));
}
