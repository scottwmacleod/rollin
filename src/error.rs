//! Typed errors for parsing and evaluating formulas.

use std::ops::Range;

/// Anything that can go wrong turning a formula into rolls. Every variant
/// carries the byte range of the offending input (into the formula as given),
/// so callers can point at it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The text is not a well-formed formula.
    Syntax { message: String, span: Range<usize> },
    /// A dice group with out-of-range counts, sides, or drop/keep amounts.
    InvalidDice { message: String, span: Range<usize> },
    /// A hard cap (ADR 0006) was exceeded. Names the cap and the term.
    LimitExceeded {
        cap: &'static str,
        limit: usize,
        term: String,
        span: Range<usize>,
    },
    /// An explode condition that holds for every face, so the die would
    /// explode forever. Rejected at parse time (ADR 0006).
    InfiniteExplosion {
        clause: String,
        sides: i64,
        span: Range<usize>,
    },
    /// Division by zero; `span` is the divisor.
    DivisionByZero { span: Range<usize> },
    /// Integer arithmetic overflowed; `span` is the operation that did.
    Overflow { span: Range<usize> },
}

impl Error {
    pub(crate) fn syntax(message: impl Into<String>, span: Range<usize>) -> Self {
        Error::Syntax {
            message: message.into(),
            span,
        }
    }

    pub(crate) fn invalid_dice(message: impl Into<String>, span: Range<usize>) -> Self {
        Error::InvalidDice {
            message: message.into(),
            span,
        }
    }

    /// The byte range of the offending input.
    pub fn span(&self) -> Range<usize> {
        match self {
            Error::Syntax { span, .. }
            | Error::InvalidDice { span, .. }
            | Error::LimitExceeded { span, .. }
            | Error::InfiniteExplosion { span, .. }
            | Error::DivisionByZero { span }
            | Error::Overflow { span } => span.clone(),
        }
    }

    /// A readable description of what went wrong.
    pub fn message(&self) -> String {
        match self {
            Error::Syntax { message, .. } | Error::InvalidDice { message, .. } => message.clone(),
            Error::LimitExceeded {
                cap, limit, term, ..
            } => format!("{cap} cap ({limit}) exceeded by '{term}'"),
            Error::InfiniteExplosion { clause, sides, .. } => format!(
                "explosion condition '{clause}' is true for every face of a d{sides}, so it would never stop"
            ),
            Error::DivisionByZero { .. } => "division by zero".into(),
            Error::Overflow { .. } => "arithmetic overflow".into(),
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message())
    }
}

impl std::error::Error for Error {}
