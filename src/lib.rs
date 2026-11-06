//! rollin: a dice roller (v2 Rust rewrite in progress).
//!
//! The library parses and evaluates formulas with an injected RNG and returns
//! a structured result; it never prints. The binary owns I/O and rendering.
//!
//! The RNG algorithm is pinned to ChaCha8 (see [`seeded_rng`]) so `--seed`
//! output stays stable. Changing it invalidates every golden fixture.

mod ast;
mod characters;
mod command;
mod completion;
mod error;
mod eval;
mod hint;
mod lexer;
mod limits;
mod name;
mod parser;
mod paths;
mod presets;
mod session;
mod settings;
mod system;

use ast::Role;
pub use ast::{BinOp, Special};
pub use command::{
    check, execute, parse_command, sample, Command, CommandError, Context, ErrorReport,
    ImportReport, Output, OutputReport, PresetEntry, PresetSource, Shadow, UndefinedVariable,
};
pub use completion::{complete, Completion, CompletionData};
pub use error::Error;
pub use hint::Hint;
pub use limits::Cap;
pub use name::{validate_name, Name, NameError, NameRule};
pub use paths::{app_dir, config_dir, config_dir_from_env, windows_config_dir};
pub use presets::{Store, StoreError};
pub use session::{format_history, help_text, session_command, SessionCommand};
pub use settings::SettingsStore;
pub use system::{Crit, CritRange, System};

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
    pub value: i64,
    pub status: Status,
    /// For a compounded exploding die (`!!`): the rolls added into `value`,
    /// in order. Empty for every other die.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub parts: Vec<i64>,
    /// On a success-count roll, whether this counting die was a success.
    /// Absent on dice that matched nothing, and on every die of a sum.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<Outcome>,
    /// Set on the kept die of a d20 check when it rolled a natural 20 or 1
    /// (see [`Roll::natural`]). Absent on every other die.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natural: Option<Natural>,
    /// The clause that made this die what it is: the reroll that replaced or
    /// was replaced, the explosion that added it, or the keep/drop that
    /// dropped it. Absent on a die no clause touched.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<Reason>,
}

/// The natural result of a d20 check's kept die.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Natural {
    /// The kept d20 rolled a 20.
    Twenty,
    /// The kept d20 rolled a 1.
    One,
}

/// Why a die is in the pool or out of it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Reason {
    /// The clause as written in the term, e.g. `r1`, `!`, `dl1`.
    pub clause: String,
    /// The index in the group's `dice` of the die that caused this one: the
    /// rerolled die a replacement follows, or the die an extra die exploded
    /// from.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<usize>,
    /// A second clause that also shaped this die: the compound `!!` on a die
    /// that is also a reroll replacement.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub also: Option<String>,
}

impl Reason {
    pub(crate) fn new(clause: &str, from: Option<usize>) -> Self {
        Reason {
            clause: clause.to_string(),
            from,
            also: None,
        }
    }
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
        /// The group's modifiers as written, in the order they apply.
        /// Absent when the group has none.
        #[serde(skip_serializing_if = "Vec::is_empty")]
        modifiers: Vec<String>,
        /// Present only for `d%`; absent on ordinary dice.
        #[serde(skip_serializing_if = "Option::is_none")]
        special: Option<Special>,
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
    /// The success/failure tally if this node is a success count (looking
    /// through parentheses).
    pub fn tally(&self) -> Option<&Tally> {
        match self {
            Node::Dice { tally, .. } => tally.as_ref(),
            Node::Group { inner, .. } => inner.tally(),
            _ => None,
        }
    }

    /// Whether this node is a success count.
    pub fn is_count(&self) -> bool {
        self.tally().is_some()
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
    /// The `# text` note on this roll's item, if it had one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// For a repeated formula (`Nx`), which repeat (from 1) this roll is in.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iteration: Option<u32>,
    /// Under a game system: whether this attack was a critical hit or miss.
    /// Absent on every other roll.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crit: Option<Crit>,
    /// Whether this roll's dice were doubled: by a `crit` suffix, or under a
    /// game system because its attack was a critical hit.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub doubled: bool,
    /// The face of this roll's d20 check die (see [`Roll::natural`]), for a
    /// game system's crit range. Not serialised.
    #[serde(skip)]
    pub(crate) check: Option<i64>,
}

impl Roll {
    /// The natural 20 or 1 of this roll's d20 check, if it has one.
    ///
    /// A roll is a d20 check when it contains exactly one d20 term that is
    /// not a success count; the check's result is that term's single kept
    /// die (so `d20adv` and `2d20kh1` read the kept die, while `3d20` is not
    /// a check). Rerolled dice are history and dropped dice never count.
    pub fn natural(&self) -> Option<Natural> {
        fn find(node: &Node) -> Option<Natural> {
            match node {
                Node::Dice { dice, .. } => dice.iter().find_map(|d| d.natural),
                Node::Neg { operand, .. } => find(operand),
                Node::Group { inner, .. } => find(inner),
                Node::Chain { first, rest, .. } => {
                    find(first).or_else(|| rest.iter().find_map(|l| find(&l.node)))
                }
                Node::Number { .. } => None,
            }
        }
        find(&self.expr)
    }
}

/// Parses and evaluates a formula (one or more comma-separated rolls) using
/// the injected RNG, returning one [`Roll`] per item.
pub fn roll(formula: &str, rng: &mut impl Rng) -> Result<Vec<Roll>, Error> {
    roll_in(formula, &|_| None, None, CritRange::default(), rng)
}

/// Like [`roll`], resolving `@name` variables through `vars` (given the
/// lowercase name, returns its value). A name `vars` does not know is an
/// [`Error::UndefinedVariable`] underlining the `@name`.
pub fn roll_with(
    formula: &str,
    vars: &dyn Fn(&str) -> Option<i64>,
    rng: &mut impl Rng,
) -> Result<Vec<Roll>, Error> {
    roll_in(formula, vars, None, CritRange::default(), rng)
}

/// Like [`roll_with`], under a game `system` (`None` rolls every item
/// independently). Each `Nx` repeat pairs its attacks and damage afresh.
/// `crit_range` is the lowest kept d20 that is a critical hit under a system.
pub fn roll_in(
    formula: &str,
    vars: &dyn Fn(&str) -> Option<i64>,
    system: Option<System>,
    crit_range: CritRange,
    rng: &mut impl Rng,
) -> Result<Vec<Roll>, Error> {
    let parsed = parser::parse_with(formula, vars)?;
    let mut rolls = Vec::new();
    for iteration in 1..=parsed.repeat.unwrap_or(1) {
        // The latest attack's crit, which later damage rolls belong to.
        let mut attack: Option<Crit> = None;
        for item in &parsed.items {
            let role = system.and_then(|_| item.role());
            let double = item.crit || (role == Some(Role::Damage) && attack == Some(Crit::Hit));
            let mut roll = eval::evaluate(item, double, rng)?;
            if role == Some(Role::Attack) {
                roll.crit = Crit::of(&roll, crit_range);
                attack = roll.crit;
            }
            roll.iteration = parsed.repeat.map(|_| iteration);
            rolls.push(roll);
        }
    }
    Ok(rolls)
}
