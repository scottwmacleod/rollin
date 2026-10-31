//! Characters and variables, through the CLI seam.

mod common;

use common::Cli;

#[test]
fn set_reports_the_variable_and_character() {
    let cli = Cli::new();
    let set = cli.run(&["set", "str", "3"]);
    set.assert_success();
    assert_eq!(set.stdout, "set str = 3 on 'default'\n");
}

#[test]
fn vars_lists_what_an_earlier_run_set_sorted() {
    let cli = Cli::new();
    cli.run(&["set", "str", "3"]).assert_success();
    cli.run(&["set", "dex", "2"]).assert_success();
    let vars = cli.run(&["vars"]);
    vars.assert_success();
    assert_eq!(vars.stdout, "dex = 2\nstr = 3\n");
}

#[test]
fn a_variable_in_a_modifier_rolls_like_its_literal() {
    let cli = Cli::new();
    cli.run(&["set", "str", "3"]).assert_success();
    let with_var = cli.roll_json("d20+@str", 7);
    let literal = cli.roll_json("d20+3", 7);
    assert_eq!(with_var["rolls"][0]["total"], literal["rolls"][0]["total"]);
    assert_eq!(with_var["rolls"][0]["expr"], literal["rolls"][0]["expr"]);
}
