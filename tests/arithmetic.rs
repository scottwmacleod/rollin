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
