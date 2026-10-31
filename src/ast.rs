//! The syntax tree a formula parses into. Evaluation walks this tree.

use serde::Serialize;
use std::ops::Range;

/// A parsed formula: an optional repeat count and the items it applies to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Formula {
    /// The `N` of a leading `Nx`; `None` when the formula is not repeated.
    pub repeat: Option<u32>,
    pub items: Vec<Item>,
}

/// One comma-separated item of a formula: a single roll.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Item {
    /// The item's source text, trimmed.
    pub source: String,
    pub expr: Expr,
    /// The `# text` note on this item, trimmed.
    pub label: Option<String>,
}

/// An expression with the byte range of the source it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Expr {
    pub kind: ExprKind,
    pub span: Range<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExprKind {
    Number(i64),
    Dice(Dice),
    Neg(Box<Expr>),
    /// A parenthesised expression.
    Group(Box<Expr>),
    /// Operands joined by operators of one precedence level, evaluated left
    /// to right. Chains are flat so long formulas do not nest deeply.
    Chain {
        first: Box<Expr>,
        rest: Vec<(BinOp, Expr)>,
    },
}

impl Expr {
    /// Whether this expression is a success count (a dice group with a
    /// success clause, possibly parenthesised).
    pub fn is_count(&self) -> bool {
        match &self.kind {
            ExprKind::Dice(d) => d.success.is_some(),
            ExprKind::Group(inner) => inner.is_count(),
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum BinOp {
    #[serde(rename = "+")]
    Add,
    #[serde(rename = "-")]
    Sub,
    #[serde(rename = "*")]
    Mul,
    #[serde(rename = "/")]
    Div,
}

impl BinOp {
    /// Higher binds tighter.
    pub fn precedence(self) -> u8 {
        match self {
            BinOp::Add | BinOp::Sub => 1,
            BinOp::Mul | BinOp::Div => 2,
        }
    }

    pub fn symbol(self) -> char {
        match self {
            BinOp::Add => '+',
            BinOp::Sub => '-',
            BinOp::Mul => '*',
            BinOp::Div => '/',
        }
    }
}

/// A dice group such as `4d6dl1`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dice {
    /// The term as written, e.g. `4d6dl1`.
    pub text: String,
    pub count: i64,
    pub sides: i64,
    /// Set for `d%`, which is not an ordinary numbered die.
    pub special: Option<Special>,
    pub reroll: Option<Reroll>,
    pub explode: Option<Explode>,
    pub select: Option<Select>,
    pub success: Option<Success>,
}

/// A die that is not written as `d<number>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Special {
    /// `d%`, a d100.
    Percentile,
}

/// A reroll clause: `r` or `rr` after the dice, before any explode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Reroll {
    pub mode: RerollMode,
    pub cmp: Cmp,
    pub value: i64,
}

/// How often a matching die is rerolled.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RerollMode {
    /// `r`: once; the second result stands even if it matches.
    Once,
    /// `rr`: until the die no longer matches.
    Repeat,
}

impl Reroll {
    /// Whether a die showing `face` is rerolled.
    pub fn triggers(&self, face: i64) -> bool {
        self.cmp.test(face, self.value)
    }
}

/// An explode clause: `!` after the dice, before any keep/drop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Explode {
    pub mode: ExplodeMode,
    pub cmp: Cmp,
    pub value: i64,
}

/// What happens to the extra rolls of an exploding die.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExplodeMode {
    /// `!`: each extra roll is a separate die in the pool.
    Plain,
    /// `!!`: extra rolls are added into the exploding die.
    Compound,
    /// `!p`: like `!`, but each extra die counts one less than it rolled.
    Penetrate,
}

/// A comparison against a face value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cmp {
    Gt,
    Ge,
    Lt,
    Le,
    Eq,
}

impl Cmp {
    /// Whether `face <cmp> value` holds.
    pub fn test(self, face: i64, value: i64) -> bool {
        match self {
            Cmp::Gt => face > value,
            Cmp::Ge => face >= value,
            Cmp::Lt => face < value,
            Cmp::Le => face <= value,
            Cmp::Eq => face == value,
        }
    }
}

impl Explode {
    /// Whether a die showing `face` explodes.
    pub fn triggers(&self, face: i64) -> bool {
        self.cmp.test(face, self.value)
    }
}

/// A success clause: `>=8`, `>7`, `<=3`, `<3` or `=10` after the other
/// modifiers. The roll becomes a success count rather than a sum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Success {
    pub cmp: Cmp,
    pub value: i64,
    pub failure: Option<Failure>,
}

/// A failure clause: `f` right after the success clause. Each counting die
/// that matches (and is not already a success) subtracts one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Failure {
    pub cmp: Cmp,
    pub value: i64,
}

impl Success {
    /// Whether a counting die showing `face` is a success.
    pub fn succeeds(&self, face: i64) -> bool {
        self.cmp.test(face, self.value)
    }

    /// Whether a counting die showing `face` is a failure. A die that is a
    /// success is never also a failure: success wins.
    pub fn fails(&self, face: i64) -> bool {
        !self.succeeds(face) && self.failure.is_some_and(|f| f.cmp.test(face, f.value))
    }
}

/// A drop/keep clause: `dl`, `dh`, `kl` or `kh` with a count.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Select {
    pub kind: SelectKind,
    pub n: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectKind {
    DropLowest,
    DropHighest,
    KeepLowest,
    KeepHighest,
}

impl Dice {
    /// How many of the lowest and highest dice this group drops from a pool
    /// of `pool` dice (more than `count` when dice explode).
    pub fn drops(&self, pool: usize) -> (i64, i64) {
        let pool = pool as i64;
        match self.select {
            None => (0, 0),
            Some(Select { kind, n }) => match kind {
                SelectKind::DropLowest => (n, 0),
                SelectKind::DropHighest => (0, n),
                SelectKind::KeepHighest => (pool - n, 0),
                SelectKind::KeepLowest => (0, pool - n),
            },
        }
    }
}
