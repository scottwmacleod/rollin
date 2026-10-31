//! rollin: a dice roller (v2 Rust rewrite in progress).
//!
//! The library parses and evaluates formulas with an injected RNG and returns
//! a structured result; it never prints. The binary owns I/O and rendering.
//!
//! The RNG algorithm is pinned to ChaCha8 (see [`seeded_rng`]) so `--seed`
//! output stays stable. Changing it invalidates every golden fixture.

mod ast;
mod error;
mod eval;
mod lexer;
mod parser;

pub use ast::BinOp;
pub use error::Error;

use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::Serialize;

/// Returns the crate version string.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Builds the pinned RNG (ChaCha8) from a user-visible seed.
pub fn seeded_rng(seed: u64) -> ChaCha8Rng {
    ChaCha8Rng::seed_from_u64(seed)
}

/// Builds the pinned RNG from OS entropy (used when no seed is given).
pub fn entropy_rng() -> ChaCha8Rng {
    ChaCha8Rng::from_entropy()
}

/// Whether a die counted toward the total.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Kept,
    Dropped,
    /// An extra die rolled because an earlier die exploded. It counts toward
    /// the total unless a keep/drop clause drops it.
    Exploded,
    /// A die replaced by a reroll. Its value is kept for the record but never
    /// counts; the replacement die follows it.
    Rerolled,
}

impl Status {
    /// Whether a die with this status counts toward its group's subtotal.
    pub fn counts(self) -> bool {
        matches!(self, Status::Kept | Status::Exploded)
    }
}

/// One individual random value inside a roll.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Die {
    pub value: u32,
    pub status: Status,
    /// For a compounded exploding die (`!!`): the rolls added into `value`,
    /// in order. Empty for every other die.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub parts: Vec<u32>,
    /// On a success-count roll, whether this counting die was a success.
    /// Absent on dice that matched nothing, and on every die of a sum.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<Outcome>,
}

/// How a counting die scored in a success-count roll.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Success,
    Failure,
}

/// What kind of number a roll produces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// A sum of faces (and flat numbers).
    Sum,
    /// A success count: dice meeting a condition, never mixed into arithmetic.
    Count,
}

impl Kind {
    fn is_sum(&self) -> bool {
        *self == Kind::Sum
    }
}

/// The tally of a success-count dice group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Tally {
    pub kind: Kind,
    pub successes: i64,
    pub failures: i64,
}

/// One node of a roll's result tree. Every node carries what it contributed,
/// so any expression can be shown term by term.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Node {
    Number {
        value: i64,
    },
    /// A dice group: its dice and their kept sum.
    Dice {
        term: String,
        sides: i64,
        dice: Vec<Die>,
        /// The sum of the counting dice, or on a success count the net
        /// successes (successes minus failures).
        subtotal: i64,
        /// Present only on a success count.
        #[serde(flatten, skip_serializing_if = "Option::is_none")]
        tally: Option<Tally>,
    },
    Neg {
        operand: Box<Node>,
        total: i64,
    },
    /// A parenthesised expression.
    Group {
        inner: Box<Node>,
        total: i64,
    },
    /// Operands joined by operators of one precedence level, left to right.
    Chain {
        first: Box<Node>,
        rest: Vec<Link>,
        total: i64,
    },
}

/// An operator and the operand on its right.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Link {
    pub op: BinOp,
    pub node: Node,
}

impl Node {
    /// Whether this node is a success count.
    pub fn is_count(&self) -> bool {
        match self {
            Node::Dice { tally, .. } => tally.is_some(),
            Node::Group { inner, .. } => inner.is_count(),
            _ => false,
        }
    }

    /// The value this node evaluates to.
    pub fn total(&self) -> i64 {
        match self {
            Node::Number { value } => *value,
            Node::Dice { subtotal, .. } => *subtotal,
            Node::Neg { total, .. } | Node::Group { total, .. } | Node::Chain { total, .. } => {
                *total
            }
        }
    }
}

/// The result of evaluating one roll.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Roll {
    pub formula: String,
    /// Omitted from JSON for an ordinary sum.
    #[serde(skip_serializing_if = "Kind::is_sum")]
    pub kind: Kind,
    pub total: i64,
    pub expr: Node,
}

/// Parses and evaluates a formula (one or more comma-separated rolls) using
/// the injected RNG, returning one [`Roll`] per item.
pub fn roll(formula: &str, rng: &mut impl Rng) -> Result<Vec<Roll>, Error> {
    let items = parser::parse(formula)?;
    items.iter().map(|item| eval::evaluate(item, rng)).collect()
}
