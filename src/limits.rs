//! The hard limits (ADR 0006), defined once. Hitting one is an error naming
//! the [`Cap`], never silent truncation. Every limit is an `i64`, matching the
//! parser's numbers, so none needs a cast to be compared or reported.

use std::fmt;

/// Most dice in one term, such as `1000d6`.
pub(crate) const MAX_DICE_PER_TERM: i64 = 1000;

/// Most extra dice one original die may roll by exploding.
pub(crate) const MAX_EXPLOSIONS_PER_DIE: i64 = 100;

/// Most rerolls of one die under `rr`.
pub(crate) const MAX_REROLLS_PER_DIE: i64 = 100;

/// Most dice in one roll, extra explosion dice included.
pub(crate) const MAX_DICE_PER_EXPRESSION: i64 = 10000;

/// Deepest nesting of parentheses.
pub(crate) const MAX_DEPTH: i64 = 32;

/// Largest `Nx` repeat count.
pub(crate) const MAX_REPEAT: i64 = 100;

/// Most sides on one die. Too many sides is an invalid-dice error, not a
/// [`Cap`]: it is a range on the die, not a budget a roll can run out of.
pub(crate) const MAX_SIDES: i64 = 10000;

/// A hard limit that [`Error::LimitExceeded`](crate::Error::LimitExceeded)
/// can name. Adding a cap means adding a variant here and a constant above;
/// [`limit`](Cap::limit) and the display text are exhaustive matches, so a
/// missing one does not compile.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Cap {
    DicePerTerm,
    ExplosionsPerDie,
    RerollsPerDie,
    DicePerExpression,
    NestingDepth,
    Repeat,
}

impl Cap {
    /// The value of this cap.
    pub fn limit(self) -> i64 {
        match self {
            Cap::DicePerTerm => MAX_DICE_PER_TERM,
            Cap::ExplosionsPerDie => MAX_EXPLOSIONS_PER_DIE,
            Cap::RerollsPerDie => MAX_REROLLS_PER_DIE,
            Cap::DicePerExpression => MAX_DICE_PER_EXPRESSION,
            Cap::NestingDepth => MAX_DEPTH,
            Cap::Repeat => MAX_REPEAT,
        }
    }
}

impl fmt::Display for Cap {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Cap::DicePerTerm => "dice per term",
            Cap::ExplosionsPerDie => "explosions per die",
            Cap::RerollsPerDie => "rerolls per die",
            Cap::DicePerExpression => "dice per expression",
            Cap::NestingDepth => "nesting depth",
            Cap::Repeat => "repeat",
        })
    }
}
