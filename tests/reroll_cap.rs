//! The 100-rerolls-per-die boundary, pinned exactly with a scripted RNG (the
//! CLI seam can only hit the cap by seed hunting).

use rand::TryRng;
use rollin::{roll, Cap, Error, Node, Status};
use std::convert::Infallible;

/// Yields `lows` draws that make a die show 1, then draws that make a d2 show
/// 2.
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

/// On a d2 that rerolls on 1, `lows` ones in a row are `lows` rerolls
/// (every one of them rerolled away), then a 2 stands.
fn run(formula: &str, lows: usize) -> Result<rollin::Roll, Error> {
    roll(formula, &mut Script { lows }).map(|mut rolls| rolls.remove(0))
}

#[test]
fn exactly_100_rerolls_are_allowed() {
    let r = run("d2rr1", 100).unwrap();
    let Node::Dice { dice, subtotal, .. } = r.expr.clone() else {
        panic!("not a dice node");
    };
    assert_eq!(dice.len(), 101);
    assert_eq!(
        dice.iter().filter(|d| d.status == Status::Rerolled).count(),
        100
    );
    assert_eq!(subtotal, 2);
}

#[test]
fn the_101st_reroll_is_an_error_naming_cap_and_term() {
    assert_eq!(
        run("d2rr1", 101).unwrap_err(),
        Error::LimitExceeded {
            cap: Cap::RerollsPerDie,
            limit: 100,
            term: "d2rr1".into(),
            span: 0..5,
        }
    );
}
