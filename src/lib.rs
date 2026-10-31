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
        dice: Vec<Die>,
        subtotal: i64,
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
    pub total: i64,
    pub expr: Node,
}

/// Parses and evaluates a formula (one or more comma-separated rolls) using
/// the injected RNG, returning one [`Roll`] per item.
pub fn roll(formula: &str, rng: &mut impl Rng) -> Result<Vec<Roll>, Error> {
    let items = parser::parse(formula)?;
    items.iter().map(|item| eval::evaluate(item, rng)).collect()
}
