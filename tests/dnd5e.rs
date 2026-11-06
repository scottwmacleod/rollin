//! The dnd5e game system: crit hits and misses on d20 attacks, and doubled
//! damage dice. The RNG is injected (ADR-0003): each test scans seeds for the
//! rolls it needs.

use rollin::{roll_in, seeded_rng, Crit, Node, Roll, System};

fn run(formula: &str, system: Option<System>, seed: u64) -> Vec<Roll> {
    roll_in(formula, &|_| None, system, &mut seeded_rng(seed)).unwrap()
}

fn dnd(formula: &str, seed: u64) -> Vec<Roll> {
    run(formula, Some(System::Dnd5e), seed)
}

/// The first rolls of `formula` under dnd5e that satisfy `want`.
fn find(formula: &str, want: impl Fn(&[Roll]) -> bool) -> Vec<Roll> {
    (0..20000)
        .map(|seed| dnd(formula, seed))
        .find(|rolls| want(rolls))
        .unwrap_or_else(|| panic!("no seed produced the wanted `{formula}` rolls"))
}

/// The face values of the dice a roll's first dice group counts.
fn counted(roll: &Roll) -> Vec<i64> {
    fn first(node: &Node) -> Option<&Node> {
        match node {
            Node::Dice { .. } => Some(node),
            Node::Neg { operand, .. } => first(operand),
            Node::Group { inner, .. } => first(inner),
            Node::Chain { first: f, rest, .. } => {
                first(f).or_else(|| rest.iter().find_map(|l| first(&l.node)))
            }
            Node::Number { .. } => None,
        }
    }
    let Some(Node::Dice { dice, .. }) = first(&roll.expr) else {
        return vec![];
    };
    dice.iter()
        .filter(|d| d.status.counts())
        .map(|d| d.value)
        .collect()
}

fn dice_count(roll: &Roll, term: &str) -> usize {
    fn walk(node: &Node, term: &str, out: &mut usize) {
        match node {
            Node::Dice { term: t, dice, .. } if t == term => *out += dice.len(),
            Node::Dice { .. } | Node::Number { .. } => {}
            Node::Neg { operand, .. } => walk(operand, term, out),
            Node::Group { inner, .. } => walk(inner, term, out),
            Node::Chain { first, rest, .. } => {
                walk(first, term, out);
                rest.iter().for_each(|l| walk(&l.node, term, out));
            }
        }
    }
    let mut n = 0;
    walk(&roll.expr, term, &mut n);
    n
}

#[test]
fn natural_twenty_is_a_crit_hit_and_doubles_damage() {
    let rolls = find("d20+5, 1d8+3", |r| r[0].crit == Some(Crit::Hit));
    assert!(!rolls[0].doubled);
    assert_eq!(rolls[1].crit, None);
    assert!(rolls[1].doubled);
    assert_eq!(dice_count(&rolls[1], "1d8"), 2);
    // The flat modifier is added once.
    let dice: i64 = counted(&rolls[1]).iter().sum();
    assert_eq!(rolls[1].total, dice + 3);
}

#[test]
fn natural_one_is_a_crit_miss_and_damage_is_normal() {
    let rolls = find("d20+5, 1d8+3", |r| r[0].crit == Some(Crit::Miss));
    assert!(!rolls[1].doubled);
    assert_eq!(dice_count(&rolls[1], "1d8"), 1);
}

#[test]
fn an_ordinary_attack_has_no_crit() {
    let rolls = find("d20+5, 1d8+3", |r| {
        r[0].crit.is_none() && r[0].natural().is_none()
    });
    assert!(!rolls[1].doubled);
}

#[test]
fn advantage_counts_through_the_kept_die() {
    let rolls = find("d20adv, 1d6", |r| r[0].crit == Some(Crit::Hit));
    assert_eq!(dice_count(&rolls[1], "1d6"), 2);
    // A natural 20 on the dropped die alone is not a crit.
    let rolls = find("d20dis, 1d6", |r| {
        r[0].crit.is_none() && format!("{:?}", r[0].expr).contains("value: 20, status: Dropped")
    });
    assert!(!rolls[1].doubled);
}

#[test]
fn every_dice_term_doubles_and_flat_numbers_do_not() {
    let rolls = find("d20+5, 1d8+2d6+4", |r| r[0].crit == Some(Crit::Hit));
    assert_eq!(dice_count(&rolls[1], "1d8"), 2);
    assert_eq!(dice_count(&rolls[1], "2d6"), 4);
    let faces: i64 = match &rolls[1].expr {
        Node::Chain { first, rest, .. } => {
            let mut sum = 0;
            for node in std::iter::once(&**first).chain(rest.iter().map(|l| &l.node)) {
                if let Node::Dice { subtotal, .. } = node {
                    sum += subtotal;
                }
            }
            sum
        }
        other => panic!("{other:?}"),
    };
    assert_eq!(rolls[1].total, faces + 4);
}

#[test]
fn extra_damage_rolls_all_belong_to_the_nearest_attack() {
    let rolls = find("d20+5, 1d8+3, 2d6 # sneak", |r| {
        r[0].crit == Some(Crit::Hit)
    });
    assert!(rolls[1].doubled && rolls[2].doubled);
    assert_eq!(dice_count(&rolls[2], "2d6"), 4);
}

#[test]
fn each_attack_pairs_with_its_own_damage() {
    // Two attacks: only the second hits critically.
    let rolls = find("d20+5, 1d8, d20+5, 1d8", |r| {
        r[0].crit.is_none() && r[2].crit == Some(Crit::Hit)
    });
    assert!(!rolls[1].doubled);
    assert!(rolls[3].doubled);
}

#[test]
fn damage_before_any_attack_rolls_normally() {
    let rolls = find("1d8, d20", |r| r[1].crit == Some(Crit::Hit));
    assert!(!rolls[0].doubled);
}

#[test]
fn two_checks_without_damage_are_just_two_checks() {
    let rolls = dnd("d20, d20", 1);
    assert_eq!(rolls.len(), 2);
    assert!(rolls.iter().all(|r| !r.doubled));
}

#[test]
fn markers_override_the_inferred_roles() {
    // A d20 marked as damage is not an attack: no crit, and it is doubled by
    // the attack before it.
    let rolls = find("d20 atk, d20 dmg", |r| r[0].crit == Some(Crit::Hit));
    assert_eq!(rolls[1].crit, None);
    assert!(rolls[1].doubled);
    assert_eq!(dice_count(&rolls[1], "d20"), 2);
    // A diced roll marked as an attack is not damage, and it starts a new
    // pairing (a non-crit attack), so the damage after it is not doubled.
    let rolls = find("d20, 1d4 atk, 1d8", |r| r[0].crit == Some(Crit::Hit));
    assert!(!rolls[1].doubled);
    assert!(!rolls[2].doubled);
}

#[test]
fn a_marker_comes_before_the_label() {
    let rolls = find("d20+5 atk # stab, 1d8 dmg # slash", |r| {
        r[0].crit == Some(Crit::Hit)
    });
    assert_eq!(rolls[0].label.as_deref(), Some("stab"));
    assert_eq!(rolls[1].label.as_deref(), Some("slash"));
    assert_eq!(rolls[0].formula, "d20+5");
    assert!(rolls[1].doubled);
}

#[test]
fn repeats_pair_independently() {
    let rolls = find("3x d20, 1d8", |r| {
        let crits: Vec<bool> = r.chunks(2).map(|c| c[0].crit == Some(Crit::Hit)).collect();
        crits.iter().any(|&c| c) && crits.iter().any(|&c| !c)
    });
    for pair in rolls.chunks(2) {
        assert_eq!(pair[1].doubled, pair[0].crit == Some(Crit::Hit));
    }
}

#[test]
fn without_a_system_nothing_changes() {
    for seed in 0..300 {
        let plain = run("d20+5, 1d8+3", None, seed);
        assert!(plain.iter().all(|r| r.crit.is_none() && !r.doubled));
        let marked = run("d20+5 atk, 1d8+3 dmg", None, seed);
        assert_eq!(
            plain.iter().map(|r| r.total).collect::<Vec<_>>(),
            marked.iter().map(|r| r.total).collect::<Vec<_>>()
        );
    }
}

#[test]
fn the_system_changes_nothing_but_the_crit_damage() {
    // The attack rolls the same dice with or without the system.
    for seed in 0..300 {
        let plain = run("d20+5, 1d8+3", None, seed);
        let dnd = dnd("d20+5, 1d8+3", seed);
        assert_eq!(plain[0].total, dnd[0].total);
        if dnd[0].crit != Some(Crit::Hit) {
            assert_eq!(plain[1].total, dnd[1].total);
        }
    }
}

#[test]
fn crit_and_doubled_serialise_only_when_set() {
    let hit = find("d20, 1d8", |r| r[0].crit == Some(Crit::Hit));
    let json = serde_json::to_value(&hit).unwrap();
    assert_eq!(json[0]["crit"], "hit");
    assert!(json[0].get("doubled").is_none());
    assert_eq!(json[1]["doubled"], true);
    assert!(json[1].get("crit").is_none());
    let miss = find("d20", |r| r[0].crit == Some(Crit::Miss));
    assert_eq!(serde_json::to_value(&miss).unwrap()[0]["crit"], "miss");
}
