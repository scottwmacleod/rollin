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

proptest! {
    #[test]
    fn drop_keep_formulas_hold_their_invariants(
        n in 2u32..=30,
        sides in 2u32..=100,
        kind in 0usize..4,
        k_raw in 0u32..1000,
        explicit in any::<bool>(),
        modifier in prop::option::of(-1000i64..=1000),
        seed in any::<u64>(),
    ) {
        // k is in 1..n, valid for every clause kind (and the default of 1 too).
        let k = 1 + k_raw % (n - 1);
        let kind = ["dl", "dh", "kl", "kh"][kind];
        let count = if explicit { k.to_string() } else { String::new() };
        let k = if explicit { k } else { 1 };
        // Dice that must be dropped, and from which end they come.
        let (dropped_expected, lowest_end) = match kind {
            "dl" => (k, true),
            "dh" => (k, false),
            "kh" => (n - k, true),
            _ => (n - k, false),
        };
        let mod_text = match modifier {
            Some(m) if m >= 0 => format!("+{m}"),
            Some(m) => m.to_string(),
            None => String::new(),
        };
        let formula = format!("{n}d{sides}{kind}{count}{mod_text}");

        let r = &roll(&formula, &mut seeded_rng(seed)).unwrap()[0];
        // The same seed rolls the same dice with no clause: the raw pool.
        let pool = &roll(&format!("{n}d{sides}"), &mut seeded_rng(seed)).unwrap()[0];

        let values = |status| -> Vec<u32> {
            r.dice.iter().filter(|d| d.status == status).map(|d| d.value).collect()
        };
        let (kept, dropped) = (values(Status::Kept), values(Status::Dropped));

        // Exactly the specified number of dice is dropped.
        prop_assert_eq!(dropped.len() as u32, dropped_expected);
        prop_assert_eq!(kept.len() + dropped.len(), n as usize);

        // Total is the kept sum plus the modifier.
        let kept_sum: i64 = kept.iter().map(|&v| i64::from(v)).sum();
        prop_assert_eq!(r.total, kept_sum + modifier.unwrap_or(0));
        prop_assert_eq!(r.modifier, modifier.unwrap_or(0));

        // Kept values are a sub-multiset of the rolled values (and so are the
        // dropped ones, and together they are exactly the rolled values).
        let mut rolled: Vec<u32> = pool.dice.iter().map(|d| d.value).collect();
        let mut all: Vec<u32> = kept.iter().chain(&dropped).copied().collect();
        rolled.sort_unstable();
        all.sort_unstable();
        prop_assert_eq!(&all, &rolled);
        let mut remaining = rolled.clone();
        for v in &kept {
            let pos = remaining.iter().position(|r| r == v);
            prop_assert!(pos.is_some(), "kept {} not among rolled {:?}", v, rolled);
            remaining.remove(pos.unwrap());
        }

        // Dropped dice come from the specified end of the pool.
        if lowest_end {
            prop_assert!(dropped.iter().all(|d| kept.iter().all(|k| d <= k)));
        } else {
            prop_assert!(dropped.iter().all(|d| kept.iter().all(|k| d >= k)));
        }
    }
}
