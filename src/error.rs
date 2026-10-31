//! Typed errors for parsing and evaluating formulas.

use crate::limits::Cap;
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
        cap: Cap,
        limit: i64,
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
    /// An `rr` condition that holds for every face, so the die would be
    /// rerolled forever. Rejected at parse time (ADR 0006).
    InfiniteReroll {
        clause: String,
        sides: i64,
        span: Range<usize>,
    },
    /// A success count used as an operand of arithmetic. `span` is the count.
    CountInArithmetic { span: Range<usize> },
    /// Division by zero; `span` is the divisor.
    DivisionByZero { span: Range<usize> },
    /// An error whose offending text includes variables: `inner` plus the
    /// values those variables resolved to, so the message can mention them.
    WithVariables {
        inner: Box<Error>,
        /// (name, value) of each variable inside the error's span.
        bindings: Vec<(String, i64)>,
    },
    /// A formula used `@name` but no variable of that name is defined.
    /// `span` is the `@name` as written.
    UndefinedVariable { name: String, span: Range<usize> },
    /// A leading `Nx` whose body rolls no dice, as in `2x3`, which was most
    /// likely meant as multiplication. `span` is the `Nx`.
    RepeatWithoutDice {
        /// The text after the `Nx`, trimmed.
        body: String,
        /// The formula rewritten with `*` for `x`, when that is unambiguous.
        multiplication: Option<String>,
        span: Range<usize>,
    },
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

    /// A [`Cap`] was exceeded by `term`; the limit is the cap's own.
    pub(crate) fn limit_exceeded(cap: Cap, term: impl Into<String>, span: Range<usize>) -> Self {
        Error::LimitExceeded {
            cap,
            limit: cap.limit(),
            term: term.into(),
            span,
        }
    }

    /// The byte range of the offending input.
    pub fn span(&self) -> Range<usize> {
        match self {
            Error::WithVariables { inner, .. } => inner.span(),
            Error::Syntax { span, .. }
            | Error::InvalidDice { span, .. }
            | Error::LimitExceeded { span, .. }
            | Error::InfiniteExplosion { span, .. }
            | Error::InfiniteReroll { span, .. }
            | Error::CountInArithmetic { span }
            | Error::DivisionByZero { span }
            | Error::UndefinedVariable { span, .. }
            | Error::RepeatWithoutDice { span, .. }
            | Error::Overflow { span } => span.clone(),
        }
    }

    /// A readable description of what went wrong.
    pub fn message(&self) -> String {
        match self {
            Error::WithVariables { inner, bindings } => {
                let values = bindings
                    .iter()
                    .map(|(name, value)| format!("@{name} is {value}"))
                    .collect::<Vec<_>>()
                    .join(", ");
                match (&**inner, bindings.len()) {
                    // `@s is 1 but sides must be between 2 and 10000`
                    (Error::InvalidDice { message, .. }, 1) => format!("{values} but {message}"),
                    _ => format!("{} ({values})", inner.message()),
                }
            }
            Error::Syntax { message, .. } | Error::InvalidDice { message, .. } => message.clone(),
            Error::LimitExceeded {
                cap, limit, term, ..
            } => format!("{cap} cap ({limit}) exceeded by '{term}'"),
            Error::InfiniteExplosion { clause, sides, .. } => format!(
                "explosion condition '{clause}' is true for every face of a d{sides}, so it would never stop"
            ),
            Error::InfiniteReroll { clause, sides, .. } => format!(
                "reroll condition '{clause}' is true for every face of a d{sides}, so it would never stop"
            ),
            Error::CountInArithmetic { .. } => "a success count cannot be used in arithmetic; use it as a whole roll, or drop the success clause to sum the dice".into(),
            Error::DivisionByZero { .. } => "division by zero".into(),
            Error::UndefinedVariable { name, .. } => format!("undefined variable @{name}"),
            Error::RepeatWithoutDice { body, .. } => {
                format!("'x' means repeat, and '{body}' has no dice to repeat")
            }
            Error::Overflow { .. } => "arithmetic overflow".into(),
        }
    }

    /// A suggestion for fixing the error, if there is one.
    pub fn hint(&self) -> Option<String> {
        match self {
            Error::WithVariables { inner, .. } => inner.hint(),
            Error::RepeatWithoutDice { multiplication, .. } => Some(match multiplication {
                Some(m) => format!("for multiplication use *; did you mean {m}?"),
                None => "for multiplication use *".into(),
            }),
            _ => None,
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message())
    }
}

impl std::error::Error for Error {}
