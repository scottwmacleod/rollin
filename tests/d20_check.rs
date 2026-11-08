//! What a d20 check is, seen through a game system: a roll that is a check
//! both pairs as an attack and can crit; one that is not does neither. The RNG
//! is injected (ADR-0003): each test scans seeds for the rolls it needs.

use rollin::{roll_in, seeded_rng, Crit, CritRange, Natural, RollResult, System};

fn dnd(formula: &str, seed: u64) -> Vec<RollResult> {
    roll_in(
        formula,
        &|_| None,
        Some(System::Dnd5e),
        CritRange::default(),
        &mut seeded_rng(seed),
    )
    .unwrap()
}

/// Whether some seed gives the first roll a natural 20 (crit hit, damage
/// doubled), and whether any seed gives it a crit or a highlighted die.
fn can_crit(formula: &str) -> bool {
    let attack_and_damage = format!("{formula}, 1d6");
    (0..4000).any(|seed| {
        let rolls = dnd(&attack_and_damage, seed);
        rolls[0].crit == Some(Crit::Hit) && rolls[0].natural() == Some(Natural::Twenty)
    })
}

/// Whether no seed ever crits or doubles the damage after the first roll.
fn never_crits(formula: &str) -> bool {
    let attack_and_damage = format!("{formula}, 1d6");
    (0..4000).all(|seed| {
        let rolls = dnd(&attack_and_damage, seed);
        rolls[0].crit.is_none() && rolls[0].natural().is_none() && !rolls[1].doubled
    })
}

#[test]
fn checks_can_crit() {
    for formula in ["d20+5", "d20adv+5", "2d20kh1+5", "d20r1+5"] {
        assert!(can_crit(formula), "{formula}");
    }
}

#[test]
fn non_checks_never_crit() {
    for formula in ["3d20+5", "2d20", "6d20>=15", "d20+d20"] {
        assert!(never_crits(formula), "{formula}");
    }
}
