//! rollin: a dice roller (v2 Rust rewrite in progress).
//!
//! The library parses and evaluates formulas with an injected RNG and returns
//! a structured result; it never prints. The binary owns I/O and rendering.
//!
//! The RNG algorithm is pinned to ChaCha8 (see [`seeded_rng`]) so `--seed`
//! output stays stable. Changing it invalidates every golden fixture.

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
    pub total: i64,
}

/// A formula could not be parsed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError(pub String);

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid formula: {}", self.0)
    }
}

impl std::error::Error for ParseError {}

/// Parses and evaluates `[N]dM` using the injected RNG.
pub fn roll(formula: &str, rng: &mut impl Rng) -> Result<Roll, ParseError> {
    let err = || ParseError(formula.to_string());
    let lower = formula.trim().to_ascii_lowercase();
    let (count, sides) = lower.split_once('d').ok_or_else(err)?;
    let count: u32 = if count.is_empty() {
        1
    } else {
        count.parse().map_err(|_| err())?
    };
    let sides: u32 = sides.parse().map_err(|_| err())?;
    if count == 0 || sides < 2 {
        return Err(err());
    }
    let dice: Vec<Die> = (0..count)
        .map(|_| Die {
            value: rng.gen_range(1..=sides),
            status: Status::Kept,
        })
        .collect();
    let total = dice.iter().map(|d| i64::from(d.value)).sum();
    Ok(Roll {
        formula: formula.trim().to_string(),
        dice,
        total,
    })
}
