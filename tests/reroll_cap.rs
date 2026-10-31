//! The 100-rerolls-per-die boundary, pinned exactly with a scripted RNG (the
//! CLI seam can only hit the cap by seed hunting).

use rand::RngCore;
use rollin::{roll, Error, Node, Status};

/// Yields `lows` draws that make a die show 1, then draws that make a d2 show
/// 2.
struct Script {
    lows: usize,
}

impl RngCore for Script {
    fn next_u32(&mut self) -> u32 {
        if self.lows > 0 {
            self.lows -= 1;
            0
        } else {
            1 << 31
        }
    }

    fn next_u64(&mut self) -> u64 {
        u64::from(self.next_u32())
    }

    fn fill_bytes(&mut self, dest: &mut [u8]) {
        dest.fill(0);
    }

    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand::Error> {
        self.fill_bytes(dest);
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
            cap: "rerolls per die",
            limit: 100,
            term: "d2rr1".into(),
            span: 0..5,
        }
    );
}
