//! The manual `crit` suffix: doubles a roll's dice by hand, with or without a
//! game system. The RNG is injected (ADR-0003).

use rollin::{roll, roll_in, seeded_rng, CritRange, Node, Roll, System};

fn plain(formula: &str, seed: u64) -> Vec<Roll> {
    roll(formula, &mut seeded_rng(seed)).unwrap()
}

fn dice_in(node: &Node) -> usize {
    match node {
        Node::Dice { dice, .. } => dice.len(),
        Node::Neg { operand, .. } => dice_in(operand),
        Node::Group { inner, .. } => dice_in(inner),
        Node::Chain { first, rest, .. } => {
            dice_in(first) + rest.iter().map(|l| dice_in(&l.node)).sum::<usize>()
        }
        Node::Number { .. } => 0,
    }
}

#[test]
fn crit_doubles_dice_and_keeps_flat_numbers_once() {
    let r = &plain("1d8+3 crit", 1)[0];
    assert!(r.doubled);
    assert_eq!(r.crit, None);
    assert_eq!(dice_in(&r.expr), 2);
    assert_eq!(r.formula, "1d8+3");
}

#[test]
fn crit_matches_the_doubled_formula_for_the_same_seed() {
    for seed in 0..50 {
        let manual = &plain("1d8+3 crit", seed)[0];
        let spelled = &plain("2d8+3", seed)[0];
        assert_eq!(manual.total, spelled.total);
    }
}

#[test]
fn crit_on_a_flat_roll_is_a_no_op() {
    let r = &plain("5 crit", 1)[0];
    assert_eq!(r.total, 5);
    assert!(!r.doubled);
}

#[test]
fn crit_works_under_a_system_and_overrides_the_pairing() {
    for seed in 0..200 {
        let rolls = roll_in(
            "d20, 1d8 crit",
            &|_| None,
            Some(System::Dnd5e),
            CritRange::default(),
            &mut seeded_rng(seed),
        )
        .unwrap();
        assert!(rolls[1].doubled);
        assert_eq!(dice_in(&rolls[1].expr), 2, "never quadrupled (seed {seed})");
    }
}

#[test]
fn crit_composes_with_role_markers_and_labels() {
    for f in ["1d8 dmg crit # x", "1d8 crit dmg # x"] {
        let r = &plain(f, 2)[0];
        assert!(r.doubled, "{f}");
        assert_eq!(r.label.as_deref(), Some("x"));
    }
}

#[test]
fn only_the_marked_item_doubles() {
    let rolls = plain("1d8 crit, 1d8", 3);
    assert!(rolls[0].doubled);
    assert!(!rolls[1].doubled);
}

#[test]
fn repeated_or_misplaced_crit_is_a_syntax_error() {
    for f in ["1d8 crit crit", "crit 1d8"] {
        assert!(roll(f, &mut seeded_rng(1)).is_err(), "{f}");
    }
}
