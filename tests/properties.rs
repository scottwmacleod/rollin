//! Library-API invariants via proptest (the secondary seam).

use proptest::prelude::*;
use rollin::{roll, seeded_rng, Status};

proptest! {
    #[test]
    fn dice_in_range_and_total_is_sum_of_kept(
        n in 1u32..=20,
        sides in 2u32..=100,
        seed in any::<u64>(),
    ) {
        let mut rng = seeded_rng(seed);
        let r = &roll(&format!("{n}d{sides}"), &mut rng).unwrap()[0];
        prop_assert_eq!(r.dice.len() as u32, n);
        for d in &r.dice {
            prop_assert!((1..=sides).contains(&d.value));
        }
        let kept_sum: i64 = r
            .dice
            .iter()
            .filter(|d| d.status == Status::Kept)
            .map(|d| i64::from(d.value))
            .sum();
        prop_assert_eq!(r.total, kept_sum);
    }
}
