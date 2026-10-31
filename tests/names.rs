//! `Name` is the only way to get a validated, lowercase name; each kind of
//! name has its own constructor because the rules differ.

use rollin::{validate_name, Name, NameRule};

fn rule<T: std::fmt::Debug>(result: Result<T, rollin::NameError>) -> NameRule {
    result.unwrap_err().rule
}

#[test]
fn preset_names_are_lowercased_and_checked_against_every_rule() {
    assert_eq!(Name::preset("Attack").unwrap().as_str(), "attack");
    assert_eq!(rule(Name::preset("1bad")), NameRule::Shape);
    assert_eq!(rule(Name::preset("Save")), NameRule::CommandWord);
    assert_eq!(rule(Name::preset("kh")), NameRule::DiceKeyword);
    assert_eq!(rule(Name::preset("d6")), NameRule::ParsesAsFormula);
    // `new` is only reserved for characters.
    assert_eq!(Name::preset("new").unwrap().as_str(), "new");
}

#[test]
fn the_public_validate_name_agrees_with_name_preset() {
    for raw in ["Attack", "save", "d6", "x y", "kh", "new", "A-b_9"] {
        assert_eq!(
            validate_name(raw).map_err(|e| e.rule),
            Name::preset(raw).map(Name::into_string).map_err(|e| e.rule),
            "{raw}"
        );
    }
}

#[test]
fn character_names_follow_the_preset_rules_and_also_reserve_new() {
    assert_eq!(Name::character("Grog").unwrap().as_str(), "grog");
    assert_eq!(rule(Name::character("NEW")), NameRule::CommandWord);
    assert_eq!(rule(Name::character("save")), NameRule::CommandWord);
}

#[test]
fn a_reference_to_a_character_only_has_to_be_shaped() {
    assert_eq!(Name::shaped("Grog").unwrap().as_str(), "grog");
    assert_eq!(Name::shaped("save").unwrap().as_str(), "save");
    assert_eq!(rule(Name::shaped("../x")), NameRule::Shape);
}

#[test]
fn variable_names_are_lowercase_letters_digits_and_underscores() {
    assert_eq!(Name::variable("Str_2").unwrap().as_str(), "str_2");
    assert!(Name::variable("a-b").is_none());
    assert!(Name::variable("1a").is_none());
    assert!(Name::variable("").is_none());
}
