//! Every hard cap (ADR 0006) is named by `Cap`, which owns its display text
//! and value, and `Error::LimitExceeded` carries the cap, not a string.

use rollin::{roll, seeded_rng, Cap, Error};

const ALL: [(Cap, &str, i64); 6] = [
    (Cap::DicePerTerm, "dice per term", 1000),
    (Cap::ExplosionsPerDie, "explosions per die", 100),
    (Cap::RerollsPerDie, "rerolls per die", 100),
    (Cap::DicePerExpression, "dice per expression", 10000),
    (Cap::NestingDepth, "nesting depth", 32),
    (Cap::Repeat, "repeat", 100),
];

#[test]
fn each_cap_displays_its_adr_name_and_has_its_adr_limit() {
    for (cap, name, limit) in ALL {
        assert_eq!(cap.to_string(), name);
        assert_eq!(cap.limit(), limit, "{name}");
    }
}

fn limit_error(formula: &str) -> (Cap, i64) {
    match roll(formula, &mut seeded_rng(1)) {
        Err(Error::LimitExceeded { cap, limit, .. }) => (cap, limit),
        other => panic!("{formula}: expected a limit error, got {other:?}"),
    }
}

#[test]
fn parse_time_caps_report_their_cap_and_limit() {
    assert_eq!(limit_error("1001d6"), (Cap::DicePerTerm, 1000));
    assert_eq!(limit_error("101x d6"), (Cap::Repeat, 100));
    assert_eq!(
        limit_error(&format!("{}d6{}", "(".repeat(33), ")".repeat(33))),
        (Cap::NestingDepth, 32)
    );
    assert_eq!(
        limit_error("1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1000d6+1d6"),
        (Cap::DicePerExpression, 10000)
    );
}
