//! Library-API invariants via proptest (the secondary seam).

use proptest::prelude::*;
use rollin::{roll, seeded_rng, Die, Node, Status};

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
            prop_assert!((1..=sides).contains(&d.value));
        }
        let kept_sum: i64 = dice
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
            dice_of(&r.expr).iter().filter(|d| d.status == status).map(|d| d.value).collect()
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
        let mut rolled: Vec<u32> = dice_of(&pool.expr).iter().map(|d| d.value).collect();
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
    fn dice_like_strings_never_panic(s in "[0-9dDkKlLhH+\\-*/() ,!]{0,40}") {
        let _ = roll(&s, &mut seeded_rng(0));
    }

    /// Errors carry a span that lies inside the formula on char boundaries.
    #[test]
    fn error_spans_lie_inside_the_input(s in "[0-9dDkKlLhH+\\-*/() ,!é]{0,40}") {
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
