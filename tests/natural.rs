//! Natural 20 / natural 1 detection on a d20 check, in the library. The RNG
//! is injected (ADR-0003): each test scans seeds for the rolls it needs.

use rollin::{roll, seeded_rng, Natural, Node, RollResult, Status};

fn one(formula: &str, seed: u64) -> RollResult {
    roll(formula, &mut seeded_rng(seed)).unwrap().remove(0)
}

/// Every die of every dice group in the roll's tree.
fn all_dice(node: &Node, out: &mut Vec<(i64, Status, Option<Natural>)>) {
    match node {
        Node::Number { .. } => {}
        Node::Dice { dice, .. } => out.extend(dice.iter().map(|d| (d.value, d.status, d.natural))),
        Node::Neg { operand, .. } => all_dice(operand, out),
        Node::Group { inner, .. } => all_dice(inner, out),
        Node::Chain { first, rest, .. } => {
            all_dice(first, out);
            rest.iter().for_each(|l| all_dice(&l.node, out));
        }
    }
}

fn dice_of(roll: &RollResult) -> Vec<(i64, Status, Option<Natural>)> {
    let mut out = Vec::new();
    all_dice(&roll.expr, &mut out);
    out
}

/// The first seed whose roll of `formula` satisfies `want`.
fn find(formula: &str, want: impl Fn(&RollResult) -> bool) -> RollResult {
    (0..5000)
        .map(|seed| one(formula, seed))
        .find(want)
        .unwrap_or_else(|| panic!("no seed produced the wanted `{formula}` roll"))
}

#[test]
fn single_d20_reports_naturals() {
    for formula in [
        "d20",
        "d20+5",
        "1d20-2",
        "d20adv",
        "d20dis",
        "2d20kh1",
        "2d20kl1",
        "d20adv+1d4",
    ] {
        let twenty = find(formula, |r| kept_d20(r) == Some(20));
        assert_eq!(twenty.natural(), Some(Natural::Twenty), "{formula}");
        let one_ = find(formula, |r| kept_d20(r) == Some(1));
        assert_eq!(one_.natural(), Some(Natural::One), "{formula}");
        let plain = find(
            formula,
            |r| matches!(kept_d20(r), Some(v) if v != 1 && v != 20),
        );
        assert_eq!(plain.natural(), None, "{formula}");
    }
}

/// The value of the kept die of the (only) d20 term.
fn kept_d20(roll: &RollResult) -> Option<i64> {
    fn d20<'a>(node: &'a Node, out: &mut Vec<&'a Node>) {
        match node {
            Node::Dice { sides: 20, .. } => out.push(node),
            Node::Neg { operand, .. } => d20(operand, out),
            Node::Group { inner, .. } => d20(inner, out),
            Node::Chain { first, rest, .. } => {
                d20(first, out);
                rest.iter().for_each(|l| d20(&l.node, out));
            }
            _ => {}
        }
    }
    let mut terms = Vec::new();
    d20(&roll.expr, &mut terms);
    let [Node::Dice { dice, .. }] = terms.as_slice() else {
        return None;
    };
    let kept: Vec<_> = dice.iter().filter(|d| d.status == Status::Kept).collect();
    (kept.len() == 1).then(|| kept[0].value)
}

#[test]
fn only_the_kept_die_is_highlighted() {
    // Advantage with a dropped 20 and a kept non-20 is not a natural 20.
    let r = find("d20dis", |r| {
        let d = dice_of(r);
        d.iter().any(|(v, s, _)| *v == 20 && *s == Status::Dropped)
            && d.iter()
                .any(|(v, s, _)| *s == Status::Kept && *v != 20 && *v != 1)
    });
    assert_eq!(r.natural(), None);
    assert!(dice_of(&r).iter().all(|(_, _, n)| n.is_none()));

    // A kept 20 is the one die flagged, the dropped die never is.
    let r = find("d20adv", |r| {
        let d = dice_of(r);
        d.iter().any(|(v, s, _)| *v == 20 && *s == Status::Kept)
            && d.iter().any(|(v, s, _)| *s == Status::Dropped && *v != 20)
    });
    let flagged: Vec<_> = dice_of(&r)
        .into_iter()
        .filter(|(_, _, n)| n.is_some())
        .collect();
    assert_eq!(flagged, vec![(20, Status::Kept, Some(Natural::Twenty))]);
}

#[test]
fn not_a_d20_check_is_never_flagged() {
    for formula in [] {
        for seed in 0..500 {
            let r = one(formula, seed);
            assert_eq!(r.natural(), None, "{formula} seed {seed}");
            assert!(
                dice_of(&r).iter().all(|(_, _, n)| n.is_none()),
                "{formula} seed {seed}"
            );
        }
    }
}

#[test]
fn rerolled_dice_do_not_count() {
    // A 1 rerolled away is history; the replacement is what stands.
    let r = find("d20r1", |r| {
        dice_of(r)
            .iter()
            .any(|(v, s, _)| *v == 1 && *s == Status::Rerolled)
    });
    let dice = dice_of(&r);
    assert!(dice
        .iter()
        .filter(|(_, s, _)| *s == Status::Rerolled)
        .all(|(_, _, n)| n.is_none()));
    let kept = dice.iter().find(|(_, s, _)| *s == Status::Kept).unwrap();
    let expected = match kept.0 {
        20 => Some(Natural::Twenty),
        _ => None,
    };
    assert_eq!(kept.2, expected);
}

#[test]
fn naturals_serialise_on_the_die() {
    let r = find("d20", |r| kept_d20(r) == Some(20));
    let json = serde_json::to_value(&r).unwrap();
    assert_eq!(json["expr"]["dice"][0]["natural"], "twenty");
    let r = find("d20", |r| kept_d20(r) == Some(7));
    let json = serde_json::to_value(&r).unwrap();
    assert!(json["expr"]["dice"][0].get("natural").is_none());
}
