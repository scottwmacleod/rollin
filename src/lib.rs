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

pub use error::{Error, ParseError};

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
}

/// One individual random value inside a roll.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Die {
    pub value: u32,
    pub status: Status,
}

/// The result of evaluating one roll.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Roll {
    pub formula: String,
    pub dice: Vec<Die>,
    /// Flat number added to the kept dice (`+5` is 5, `-2` is -2).
    pub modifier: i64,
    pub total: i64,
}

/// Parses and evaluates a formula (one or more comma-separated rolls) using
/// the injected RNG, returning one [`Roll`] per item.
pub fn roll(formula: &str, rng: &mut impl Rng) -> Result<Vec<Roll>, Error> {
    let items = parser::parse(formula)?;
    items.iter().map(|item| eval::evaluate(item, rng)).collect()
}
