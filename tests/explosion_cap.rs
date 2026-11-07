//! The 100-explosions-per-die boundary, pinned exactly with a scripted RNG
//! (the CLI seam can only hit the cap by seed hunting).

use rand::TryRng;
use rollin::{roll, Cap, Error, Status};
use std::convert::Infallible;

/// Yields `lows` draws that make a die show 1, then draws that make a d2 show
/// 2 (a plain `u32::MAX` would be rejected by the sampler forever).
struct Script {
    lows: usize,
}

impl TryRng for Script {
    type Error = Infallible;

    fn try_next_u32(&mut self) -> Result<u32, Infallible> {
        if self.lows > 0 {
            self.lows -= 1;
            Ok(0)
        } else {
            Ok(1 << 31)
        }
    }

    fn try_next_u64(&mut self) -> Result<u64, Infallible> {
        self.try_next_u32().map(u64::from)
    }

    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), Infallible> {
        dest.fill(0);
        Ok(())
    }
}

/// On a d2 that explodes on 1, `lows` ones in a row are one original die plus
/// `lows - 1` ones that each exploded again, ending on a 2.
fn run(formula: &str, lows: usize) -> Result<rollin::Roll, Error> {
    roll(formula, &mut Script { lows }).map(|mut rolls| rolls.remove(0))
}

#[test]
fn exactly_100_explosions_are_allowed_in_every_mode() {
    for formula in ["d2!<=1", "d2!!<=1", "d2!p<=1"] {
        // 100 ones, then a 2: the original and 99 extras explode, the 100th
        // extra shows 2 and stops.
        let r = run(formula, 100).unwrap_or_else(|e| panic!("{formula}: {e}"));
        assert!(matches!(r.expr, rollin::Node::Dice { .. }));
    }
}

#[test]
fn the_101st_explosion_is_an_error_naming_cap_and_term_in_every_mode() {
    for formula in ["d2!<=1", "d2!!<=1", "d2!p<=1"] {
        let err = run(formula, 101).unwrap_err();
        assert_eq!(
            err,
            Error::LimitExceeded {
                cap: Cap::ExplosionsPerDie,
                limit: 100,
                term: formula.to_string(),
                span: 0..formula.len(),
            }
        );
    }
}

#[test]
fn the_plain_pool_records_100_exploded_dice_at_the_boundary() {
    let r = run("d2!<=1", 100).unwrap();
    let rollin::Node::Dice { dice, .. } = r.expr else {
        panic!("not a dice node");
    };
    // The original, then 100 extras, the last of which stopped.
    assert_eq!(dice.len(), 101);
    assert_eq!(
        dice.iter().filter(|d| d.status == Status::Exploded).count(),
        100
    );
}
