//! Library-API invariants via proptest (the secondary seam).

use proptest::prelude::*;
use rollin::{roll, seeded_rng, Die, Kind, Node, Outcome, Status};

/// Every die in a result tree, in roll order.
fn dice_of(node: &Node) -> Vec<Die> {
    match node {
        Node::Number { .. } => Vec::new(),
        Node::Dice { dice, .. } => dice.clone(),
        Node::Neg { operand, .. } => dice_of(operand),
        Node::Group { inner, .. } => dice_of(inner),
        Node::Chain { first, rest, .. } => {
            let mut all = dice_of(first);
            for link in rest {
                all.extend(dice_of(&link.node));
            }
            all
        }
    }
}

proptest! {
    #[test]
    fn dice_in_range_and_total_is_sum_of_kept(
        n in 1u32..=20,
        sides in 2u32..=100,
        seed in any::<u64>(),
    ) {
        let mut rng = seeded_rng(seed);
        let r = &roll(&format!("{n}d{sides}"), &mut rng).unwrap()[0];
        let dice = dice_of(&r.expr);
        prop_assert_eq!(dice.len() as u32, n);
        for d in &dice {
            prop_assert!((1..=sides).contains(&(d.value as u32)));
        }
        let kept_sum: i64 = dice
            .iter()
            .filter(|d| d.status == Status::Kept)
            .map(|d| d.value)
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
            dice_of(&r.expr).iter().filter(|d| d.status == status).map(|d| d.value as u32).collect()
        };
        let (kept, dropped) = (values(Status::Kept), values(Status::Dropped));

        // Exactly the specified number of dice is dropped.
        prop_assert_eq!(dropped.len() as u32, dropped_expected);
        prop_assert_eq!(kept.len() + dropped.len(), n as usize);

        // Total is the kept sum plus the modifier.
        let kept_sum: i64 = kept.iter().map(|&v| i64::from(v)).sum();
        prop_assert_eq!(r.total, kept_sum + modifier.unwrap_or(0));

        // Kept values are a sub-multiset of the rolled values (and so are the
        // dropped ones, and together they are exactly the rolled values).
        let mut rolled: Vec<u32> = dice_of(&pool.expr).iter().map(|d| d.value as u32).collect();
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

// ---- Arithmetic and robustness ----

use rollin::Error;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    /// Parsing (and evaluating, if it parses) arbitrary text never panics.
    #[test]
    fn arbitrary_strings_never_panic(s in any::<String>()) {
        let _ = roll(&s, &mut seeded_rng(0));
    }

    /// The same, from an alphabet where many strings are almost-valid.
    #[test]
    fn dice_like_strings_never_panic(s in "[0-9dDfFkKlLhHpPrR+\\-*/() ,!<>=%aAvVsSiI#xX]{0,40}") {
        let _ = roll(&s, &mut seeded_rng(0));
    }

    /// Errors carry a span that lies inside the formula on char boundaries.
    #[test]
    fn error_spans_lie_inside_the_input(s in "[0-9dDfFkKlLhHpPrR+\\-*/() ,!<>=é]{0,40}") {
        if let Err(e) = roll(&s, &mut seeded_rng(0)) {
            let span = e.span();
            prop_assert!(span.start <= span.end && span.end <= s.len(), "{:?} {:?}", s, span);
            prop_assert!(s.is_char_boundary(span.start) && s.is_char_boundary(span.end));
        }
    }
}

/// A generated arithmetic expression.
#[derive(Debug, Clone)]
enum Gen {
    Num(i64),
    Dice(u32, u32, Option<(&'static str, u32)>),
    Neg(Box<Gen>),
    Paren(Box<Gen>),
    Bin(Box<Gen>, char, Box<Gen>),
}

impl Gen {
    fn render(&self) -> String {
        match self {
            Gen::Num(n) => n.to_string(),
            Gen::Dice(n, sides, None) => format!("{n}d{sides}"),
            Gen::Dice(n, sides, Some((kind, k))) => format!("{n}d{sides}{kind}{k}"),
            Gen::Neg(e) => format!("-{}", e.operand()),
            Gen::Paren(e) => format!("({})", e.render()),
            Gen::Bin(l, op, r) => format!("{} {op} {}", l.operand(), r.operand()),
        }
    }

    /// Rendered so that it binds as one unit.
    fn operand(&self) -> String {
        match self {
            Gen::Bin(..) => format!("({})", self.render()),
            _ => self.render(),
        }
    }
}

fn gen_expr(with_dice: bool) -> impl Strategy<Value = Gen> {
    let num = prop_oneof![
        3 => 0i64..=100,
        1 => Just(i64::MAX),
        1 => 0i64..=1_000_000_000_000,
    ]
    .prop_map(Gen::Num);
    let dice = (1u32..=6, 2u32..=20, prop::option::of((0usize..4, 1u32..=5))).prop_map(
        |(n, sides, sel)| {
            // Only keep/drop amounts below the dice count are valid.
            let sel = sel.and_then(|(k, amount)| {
                (amount < n).then(|| (["dl", "dh", "kl", "kh"][k], amount))
            });
            Gen::Dice(n, sides, sel)
        },
    );
    let leaf = if with_dice {
        prop_oneof![num, dice].boxed()
    } else {
        num.boxed()
    };
    leaf.prop_recursive(5, 48, 4, |inner| {
        prop_oneof![
            inner.clone().prop_map(|e| Gen::Neg(Box::new(e))),
            inner.clone().prop_map(|e| Gen::Paren(Box::new(e))),
            (
                inner.clone(),
                prop::sample::select(vec!['+', '-', '*', '/']),
                inner
            )
                .prop_map(|(l, op, r)| Gen::Bin(Box::new(l), op, Box::new(r))),
        ]
    })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    /// Valid arithmetic never panics, and only fails with an arithmetic error.
    #[test]
    fn generated_expressions_evaluate_without_panicking(
        e in gen_expr(true),
        seed in any::<u64>(),
    ) {
        match roll(&e.render(), &mut seeded_rng(seed)) {
            Ok(rolls) => prop_assert_eq!(rolls[0].total, rolls[0].expr.total()),
            Err(Error::Overflow { .. } | Error::DivisionByZero { .. }) => {}
            Err(other) => prop_assert!(false, "{:?} failed with {:?}", e.render(), other),
        }
    }

    /// Dice-free expressions match an independent checked-arithmetic oracle.
    #[test]
    fn numeric_expressions_match_an_oracle(e in gen_expr(false)) {
        fn oracle(e: &Gen) -> Result<i64, &'static str> {
            match e {
                Gen::Num(n) => Ok(*n),
                Gen::Dice(..) => unreachable!(),
                Gen::Neg(e) => oracle(e)?.checked_neg().ok_or("overflow"),
                Gen::Paren(e) => oracle(e),
                Gen::Bin(l, op, r) => {
                    let (l, r) = (oracle(l)?, oracle(r)?);
                    match op {
                        '+' => l.checked_add(r).ok_or("overflow"),
                        '-' => l.checked_sub(r).ok_or("overflow"),
                        '*' => l.checked_mul(r).ok_or("overflow"),
                        _ if r == 0 => Err("zero"),
                        _ => l.checked_div(r).ok_or("overflow"),
                    }
                }
            }
        }
        let got = roll(&e.render(), &mut seeded_rng(0));
        match (oracle(&e), got) {
            (Ok(want), Ok(rolls)) => prop_assert_eq!(rolls[0].total, want),
            (Err("zero"), Err(Error::DivisionByZero { .. })) => {}
            (Err("overflow"), Err(Error::Overflow { .. })) => {}
            (want, got) => prop_assert!(false, "{:?}: want {:?}, got {:?}", e.render(), want, got),
        }
    }

    /// Flat chains follow standard precedence: * and / first, then + and -,
    /// both left to right, with division truncating toward zero.
    #[test]
    fn flat_chains_follow_standard_precedence(
        first in 0i64..=50,
        rest in prop::collection::vec((prop::sample::select(vec!['+', '-', '*', '/']), 1i64..=50), 0..8),
    ) {
        let text: String = std::iter::once(first.to_string())
            .chain(rest.iter().map(|(op, n)| format!("{op}{n}")))
            .collect();
        // Fold products/quotients into terms, then sum the terms.
        let mut terms: Vec<i64> = vec![first];
        for (op, n) in &rest {
            match op {
                '+' => terms.push(*n),
                '-' => terms.push(-*n),
                '*' => *terms.last_mut().unwrap() *= n,
                _ => *terms.last_mut().unwrap() /= n,
            }
        }
        let want: i64 = terms.iter().sum();
        let got = roll(&text, &mut seeded_rng(0)).unwrap();
        prop_assert_eq!(got[0].total, want, "{}", text);
    }
}

/// An exploding formula: a count, sides, a mode (`!`, `!!`, `!p`), an
/// optional condition and an optional drop clause over the exploded pool.
fn gen_exploding() -> impl Strategy<Value = (String, u32, u32, usize)> {
    (
        1u32..=6,
        2u32..=20,
        0usize..3,
        prop::option::of((0usize..5, 0u32..=22)),
        prop::option::of(1u32..=3),
    )
        .prop_map(|(n, sides, mode, cond, drop)| {
            let mode_text = ["!", "!!", "!p"][mode];
            let cond_text = cond.map_or(String::new(), |(op, v)| {
                format!("{}{v}", [">", ">=", "<", "<=", "="][op])
            });
            let drop_text = match drop {
                Some(k) if k < n => format!("dl{k}"),
                _ => String::new(),
            };
            (
                format!("{n}d{sides}{mode_text}{cond_text}{drop_text}"),
                n,
                sides,
                mode,
            )
        })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    /// For arbitrary exploding formulas the total is the sum of the counted
    /// dice as recorded, plain and penetrating dice never exceed the sides,
    /// compounded dice equal the sum of their parts, and no die explodes more
    /// than the cap. Only the static rejection and the caps may fail a roll.
    #[test]
    fn exploding_totals_agree_with_the_recorded_dice(
        (formula, n, sides, mode) in gen_exploding(),
        seed in any::<u64>(),
    ) {
        let rolls = match roll(&formula, &mut seeded_rng(seed)) {
            Ok(rolls) => rolls,
            Err(Error::InfiniteExplosion { .. } | Error::LimitExceeded { .. }) => return Ok(()),
            Err(e) => return Err(TestCaseError::fail(format!("{formula}: {e}"))),
        };
        let r = &rolls[0];
        let dice = dice_of(&r.expr);
        let counted: i64 = dice
            .iter()
            .filter(|d| d.status.counts())
            .map(|d| d.value)
            .sum();
        prop_assert_eq!(r.total, counted, "{}", formula);
        prop_assert_eq!(r.expr.total(), counted);

        let exploded = dice.iter().filter(|d| d.status == Status::Exploded).count();
        prop_assert!(exploded <= 100 * n as usize, "{}", formula);
        match mode {
            0 | 2 => {
                for d in &dice {
                    prop_assert!(d.value <= i64::from(sides), "{}: {:?}", formula, d);
                    prop_assert!(d.parts.is_empty());
                }
            }
            _ => {
                prop_assert_eq!(exploded, 0);
                for d in &dice {
                    if !d.parts.is_empty() {
                        prop_assert_eq!(d.parts.iter().sum::<i64>(), d.value);
                        prop_assert!(d.parts.len() <= 101);
                    }
                }
            }
        }
    }
}

/// A reroll formula: count, sides, `r` or `rr`, a condition, then optional
/// explode and drop clauses. Returns the formula, the mode and the condition
/// as a predicate description `(cmp index, value)`.
fn gen_reroll() -> impl Strategy<Value = (String, bool, usize, u32, u32)> {
    (
        1u32..=6,
        2u32..=20,
        any::<bool>(),
        0usize..6,
        0u32..=22,
        any::<bool>(),
        prop::option::of(1u32..=3),
    )
        .prop_map(|(n, sides, repeat, cmp, v, explode, drop)| {
            // Index 5 is the bare-number form, which means equals.
            let cond = match cmp {
                5 => v.to_string(),
                c => format!("{}{v}", [">", ">=", "<", "<=", "="][c]),
            };
            let drop_text = match drop {
                Some(k) if k < n => format!("dl{k}"),
                _ => String::new(),
            };
            let formula = format!(
                "{n}d{sides}{}{cond}{}{drop_text}",
                if repeat { "rr" } else { "r" },
                if explode { "!" } else { "" },
            );
            (formula, repeat, cmp, v, sides)
        })
}

fn cond_matches(cmp: usize, v: u32, face: i64) -> bool {
    let v = i64::from(v);
    match cmp {
        0 => face > v,
        1 => face >= v,
        2 => face < v,
        3 => face <= v,
        _ => face == v,
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    /// For arbitrary reroll formulas: the total is the sum of the counting
    /// dice; rerolled-away dice never count; under `rr` every standing
    /// original die (a die that follows its slot's rerolls and is not an
    /// explosion) fails the condition; and no die is rerolled more than the
    /// cap. Only the static rejection and the caps may fail a roll.
    #[test]
    fn rerolled_totals_agree_and_rr_leaves_no_matching_final_die(
        (formula, repeat, cmp, v, sides) in gen_reroll(),
        seed in any::<u64>(),
    ) {
        let rolls = match roll(&formula, &mut seeded_rng(seed)) {
            Ok(rolls) => rolls,
            Err(Error::InfiniteReroll { .. } | Error::InfiniteExplosion { .. } | Error::LimitExceeded { .. }) => {
                return Ok(());
            }
            Err(e) => return Err(TestCaseError::fail(format!("{formula}: {e}"))),
        };
        let r = &rolls[0];
        let dice = dice_of(&r.expr);
        let counted: i64 = dice
            .iter()
            .filter(|d| d.status.counts())
            .map(|d| d.value)
            .sum();
        prop_assert_eq!(r.total, counted, "{}", formula);
        prop_assert!(dice.iter().all(|d| (1..=sides).contains(&(d.value as u32))), "{}", formula);

        // Runs of rerolled dice, each ended by the die that replaced them.
        let mut run = 0usize;
        for (i, d) in dice.iter().enumerate() {
            if d.status == Status::Rerolled {
                run += 1;
                prop_assert!(cond_matches(cmp, v, d.value), "{}: {:?}", formula, dice);
                prop_assert!(run <= 100, "{}", formula);
                if !repeat {
                    prop_assert!(run <= 1, "{}: {:?}", formula, dice);
                }
                prop_assert!(i + 1 < dice.len(), "{}: ends on a rerolled die", formula);
            } else {
                if run > 0 && repeat {
                    // Exploded dice and the explosions of this die follow it;
                    // the replacement itself is the die right after the run.
                    prop_assert!(!cond_matches(cmp, v, d.value), "{}: {:?}", formula, dice);
                }
                run = 0;
            }
        }
        if repeat {
            // Every die that stands as an original (not exploded, not
            // dropped-from-explosion) fails the condition. Exploded extras
            // are plain rolls and may match.
            let exploding = formula.contains('!');
            for d in dice.iter().filter(|d| match d.status {
                Status::Kept => true,
                Status::Dropped => !exploding,
                _ => false,
            }) {
                prop_assert!(!cond_matches(cmp, v, d.value), "{}: {:?}", formula, dice);
            }
        }
    }

    /// Parsing arbitrary text containing reroll letters never panics, and
    /// reroll-shaped text always errors or succeeds cleanly.
    #[test]
    fn reroll_like_strings_never_panic(s in "[0-9dDrR<>=!kKhHlL ]{0,30}") {
        let _ = roll(&s, &mut seeded_rng(0));
    }
}

/// A comparison written out and its predicate; index 5 is the bare-number
/// form (equals), valid only for failure clauses.
fn cond_text(cmp: usize, v: u32) -> String {
    match cmp {
        5 => v.to_string(),
        c => format!("{}{v}", [">", ">=", "<", "<=", "="][c]),
    }
}

/// A success-count formula: dice, optional reroll/explode/drop, a success
/// clause and an optional failure clause.
#[allow(clippy::type_complexity)]
fn gen_success() -> impl Strategy<Value = (String, (usize, u32), Option<(usize, u32)>, u32)> {
    (
        (1u32..=8, 2u32..=20),
        (0usize..5, 0u32..=22),
        prop::option::of((0usize..6, 0u32..=22)),
        (any::<bool>(), any::<bool>(), prop::option::of(1u32..=3)),
    )
        .prop_map(|((n, sides), success, failure, (reroll, explode, drop))| {
            let drop_text = match drop {
                Some(k) if k < n => format!("dl{k}"),
                _ => String::new(),
            };
            let formula = format!(
                "{n}d{sides}{}{}{drop_text}{}{}",
                if reroll { "r=1" } else { "" },
                if explode {
                    format!("!={sides}")
                } else {
                    String::new()
                },
                cond_text(success.0, success.1),
                failure.map_or(String::new(), |(c, v)| format!("f{}", cond_text(c, v))),
            );
            (formula, success, failure, sides)
        })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    /// The total of a success count is its successes minus its failures,
    /// which are exactly the counting dice matching the success condition and
    /// (if not already successes) the failure condition. Dropped and
    /// rerolled-away dice never score. Only the caps may fail a roll.
    #[test]
    fn success_tally_equals_matching_counting_dice(
        (formula, success, failure, sides) in gen_success(),
        seed in any::<u64>(),
    ) {
        let rolls = match roll(&formula, &mut seeded_rng(seed)) {
            Ok(rolls) => rolls,
            Err(rollin::Error::LimitExceeded { .. } | rollin::Error::InfiniteExplosion { .. }) => {
                return Ok(());
            }
            Err(e) => return Err(TestCaseError::fail(format!("{formula}: {e}"))),
        };
        let r = &rolls[0];
        prop_assert_eq!(r.kind, Kind::Count, "{}", formula);
        let Node::Dice { dice, tally, subtotal, .. } = &r.expr else {
            return Err(TestCaseError::fail(format!("{formula}: not a dice node")));
        };
        let tally = tally.as_ref().expect("a success count has a tally");
        let (mut s, mut f) = (0i64, 0i64);
        for d in dice {
            let face = d.value;
            let expect = if !d.status.counts() {
                None
            } else if cond_matches(success.0, success.1, face) {
                Some(Outcome::Success)
            } else if failure.is_some_and(|(c, v)| cond_matches(c, v, face)) {
                Some(Outcome::Failure)
            } else {
                None
            };
            prop_assert_eq!(d.outcome, expect, "{}: {:?}", formula, d);
            s += i64::from(expect == Some(Outcome::Success));
            f += i64::from(expect == Some(Outcome::Failure));
        }
        prop_assert_eq!((tally.successes, tally.failures), (s, f), "{}", formula);
        prop_assert_eq!(*subtotal, s - f, "{}", formula);
        prop_assert_eq!(r.total, s - f, "{}", formula);
        prop_assert!(dice.iter().all(|d| (1..=sides).contains(&(d.value as u32))), "{}", formula);
    }

    /// Text built from the success/failure alphabet never panics, and
    /// every error span stays inside the input on char boundaries.
    #[test]
    fn success_like_strings_never_panic(s in "[0-9dDfF+\\-*/(), <>=!rRkKhHlLé%aAvVsSiI]{0,30}") {
        if let Err(e) = roll(&s, &mut seeded_rng(0)) {
            let span = e.span();
            prop_assert!(span.start <= span.end && span.end <= s.len(), "{:?} {:?}", s, span);
            prop_assert!(s.is_char_boundary(span.start) && s.is_char_boundary(span.end));
        }
    }
}

/// Advantage, disadvantage, percentile and fudge dice.
mod special_dice {
    use super::*;

    fn only_roll(formula: &str, seed: u64) -> rollin::Roll {
        roll(formula, &mut seeded_rng(seed)).unwrap().remove(0)
    }

    /// The tree and total of a roll, ignoring the text that was typed.
    fn shape(r: &rollin::Roll) -> (Vec<Die>, i64) {
        (dice_of(&r.expr), r.total)
    }

    proptest! {
        /// `adv` keeps the higher of its two dice, `dis` the lower, and the
        /// other is dropped.
        #[test]
        fn adv_keeps_the_max_and_dis_the_min(sides in 2u32..=1000, seed in any::<u64>()) {
            for (suffix, keeps_max) in [("adv", true), ("dis", false)] {
                let r = only_roll(&format!("d{sides}{suffix}"), seed);
                let dice = dice_of(&r.expr);
                prop_assert_eq!(dice.len(), 2);
                let (hi, lo) = (
                    dice.iter().map(|d| d.value).max().unwrap(),
                    dice.iter().map(|d| d.value).min().unwrap(),
                );
                let kept: Vec<_> = dice.iter().filter(|d| d.status == Status::Kept).collect();
                prop_assert_eq!(kept.len(), 1);
                prop_assert_eq!(kept[0].value, if keeps_max { hi } else { lo });
                prop_assert_eq!(dice.iter().filter(|d| d.status == Status::Dropped).count(), 1);
                prop_assert_eq!(r.total, kept[0].value);
            }
        }

        /// `dXadv` is `2dXkh1` and `dXdis` is `2dXkl1`: same dice, same total,
        /// same RNG use (a trailing term shows the stream stays in step).
        #[test]
        fn adv_and_dis_equal_keep_highest_and_lowest_of_two(
            sides in 2u32..=10_000,
            flat in 0u32..=20,
            seed in any::<u64>(),
        ) {
            for (suffix, keep) in [("adv", "kh1"), ("dis", "kl1")] {
                let sugar = only_roll(&format!("d{sides}{suffix}+{flat}+d6"), seed);
                let plain = only_roll(&format!("2d{sides}{keep}+{flat}+d6"), seed);
                prop_assert_eq!(shape(&sugar), shape(&plain));
            }
        }

        /// `d%` always rolls 1..=100 and is a d100 under the same seed.
        #[test]
        fn percentile_dice_are_d100s(n in 1u32..=30, seed in any::<u64>()) {
            let pct = only_roll(&format!("{n}d%"), seed);
            for d in dice_of(&pct.expr) {
                prop_assert!((1..=100).contains(&d.value), "{:?}", d);
            }
            prop_assert_eq!(shape(&pct), shape(&only_roll(&format!("{n}d100"), seed)));
        }

        /// Every fudge die is -1, 0 or +1, so `NdF` totals within -N..=N.
        #[test]
        fn fudge_dice_are_minus_one_zero_or_plus_one(n in 1i64..=100, seed in any::<u64>()) {
            let r = only_roll(&format!("{n}dF"), seed);
            let dice = dice_of(&r.expr);
            prop_assert_eq!(dice.len() as i64, n);
            prop_assert!(dice.iter().all(|d| (-1..=1).contains(&d.value)));
            prop_assert!((-n..=n).contains(&r.total), "{} out of range for {}dF", r.total, n);
            prop_assert_eq!(r.total, dice.iter().map(|d| d.value).sum::<i64>());
        }

        /// Text dense in the new suffixes never panics, and every error span
        /// stays inside the input on char boundaries.
        #[test]
        fn special_dice_like_strings_never_panic(
            s in "(d|D|[0-9]|%|F|f|adv|ADV|dis|DIS|dl|kh|r|!|>=|[+*, é-]){0,16}",
        ) {
            if let Err(e) = roll(&s, &mut seeded_rng(0)) {
                let span = e.span();
                prop_assert!(span.start <= span.end && span.end <= s.len(), "{:?} {:?}", s, span);
                prop_assert!(s.is_char_boundary(span.start) && s.is_char_boundary(span.end));
            }
        }
    }
}

// ---- Presets and the command parser (library seam, invariants only) ----

mod presets {
    use proptest::prelude::*;
    use rollin::{
        execute, parse_command, roll, seeded_rng, validate_name, Command, CommandError, Context,
        Output,
    };

    fn no_presets() -> Result<Vec<String>, CommandError> {
        Ok(Vec::new())
    }

    proptest! {
        /// Whatever name validation accepts is stored lowercase and can be
        /// rolled back by name (in any letter case).
        #[test]
        fn accepted_names_are_lowercase_and_roll_back(
            raw in "[A-Za-z][A-Za-z0-9_ -]{0,10}",
            seed in any::<u64>(),
        ) {
            if let Ok(stored) = validate_name(&raw) {
                prop_assert_eq!(&stored, &raw.to_lowercase());
                let dir = tempfile::TempDir::new().unwrap();
                let ctx = Context::new(Some(dir.path().to_path_buf()));
                let mut rng = seeded_rng(seed);
                let save = Command::Save { name: raw.clone(), formula: "2d6+1".into() };
                execute(&save, &ctx, &mut rng).unwrap();
                let command = parse_command(
                    &[raw.to_uppercase()],
                    &mut || Ok(vec![stored.clone()]),
                ).unwrap();
                prop_assert_eq!(&command, &Command::RollPreset(stored.clone()));
                match execute(&command, &ctx, &mut rng).unwrap() {
                    Output::Rolls { preset, rolls } => {
                        prop_assert_eq!(preset, Some((stored, "2d6+1".to_string())));
                        prop_assert_eq!(rolls.len(), 1);
                    }
                    other => prop_assert!(false, "unexpected {:?}", other),
                }
            }
        }

        /// A name that parses as a dice formula is never accepted.
        #[test]
        fn names_that_parse_as_formulas_are_rejected(
            name in "[0-9]{0,2}[dD][0-9a-zA-Z%]{0,4}",
        ) {
            if roll(&name, &mut seeded_rng(0)).is_ok() {
                prop_assert!(validate_name(&name).is_err(), "{} accepted", name);
            }
        }

        /// Dispatch never panics, whatever the words.
        #[test]
        fn parse_command_never_panics(
            words in proptest::collection::vec("[ -~]{0,8}", 0..6),
        ) {
            let _ = parse_command(&words, &mut no_presets);
        }

        /// Same, drawing words from the command vocabulary so every branch is hit.
        #[test]
        fn parse_command_never_panics_on_command_words(
            words in proptest::collection::vec(
                prop_oneof![
                    Just("save".to_string()), Just("presets".to_string()),
                    Just("delete".to_string()), Just("import".to_string()),
                    Just("roll".to_string()), Just("--force".to_string()),
                    Just("d20".to_string()), "[a-z-]{0,6}",
                ],
                0..6,
            ),
        ) {
            let _ = parse_command(&words, &mut no_presets);
        }
    }
}

/// Repeat (`Nx`) and labels (`# text`).
mod repeat_labels {
    use super::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(256))]

        /// `Nx` over a list yields N times its rolls, with iterations
        /// numbered 1..=N in order and no iteration field without `Nx`.
        #[test]
        fn repeat_yields_n_times_the_rolls_numbered_in_order(
            n in 1u32..=100,
            sp in "[ ]{0,2}",
            x in prop_oneof![Just("x"), Just("X")],
            seed in any::<u64>(),
        ) {
            let list = "d20+5, 2d6, 3";
            let rolls = roll(&format!("{n}{sp}{x} {list}"), &mut seeded_rng(seed)).unwrap();
            prop_assert_eq!(rolls.len(), 3 * n as usize);
            for (i, r) in rolls.iter().enumerate() {
                prop_assert_eq!(r.iteration, Some(i as u32 / 3 + 1));
            }
            let plain = roll(list, &mut seeded_rng(seed)).unwrap();
            prop_assert!(plain.iter().all(|r| r.iteration.is_none()));
        }

        /// A label never changes the dice or totals: the same seed rolls the
        /// same with and without it, repeated or not.
        #[test]
        fn labels_never_alter_dice_or_totals(
            label in "[a-z0-9 ()#!é✨%x-]{0,12}",
            n in 1u32..=5,
            seed in any::<u64>(),
        ) {
            let label = format!("a{label}");
            let bare = "4d6dl1, d20adv+5, 6d10>=8f1";
            let tagged = "4d6dl1 # {L}, d20adv+5 #{L}, 6d10>=8f1 # {L}".replace("{L}", &label);
            let a = roll(&format!("{n}x {bare}"), &mut seeded_rng(seed)).unwrap();
            let b = roll(&format!("{n}x {tagged}"), &mut seeded_rng(seed)).unwrap();
            prop_assert_eq!(a.len(), b.len());
            for (x, y) in a.iter().zip(&b) {
                prop_assert_eq!(x.total, y.total);
                prop_assert_eq!(&x.expr, &y.expr);
                prop_assert_eq!(&x.formula, &y.formula);
                prop_assert_eq!(y.label.as_deref(), Some(label.trim()));
                prop_assert_eq!(x.iteration, y.iteration);
            }
        }

        /// Text dense in `#`, `x` and `,` never panics and every error span
        /// stays inside the input on char boundaries.
        #[test]
        fn repeat_and_label_like_strings_never_panic(
            s in "[0-9dDxX#,é ()+*a]{0,30}",
        ) {
            if let Err(e) = roll(&s, &mut seeded_rng(0)) {
                let span = e.span();
                prop_assert!(span.start <= span.end && span.end <= s.len(), "{:?} {:?}", s, span);
                prop_assert!(s.is_char_boundary(span.start) && s.is_char_boundary(span.end));
            }
        }
    }
}
