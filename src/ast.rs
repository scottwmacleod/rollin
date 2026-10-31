//! The syntax tree a formula parses into. Evaluation walks this tree.

use serde::Serialize;
use std::ops::Range;

/// One comma-separated item of a formula: a single roll.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Item {
    /// The item's source text, trimmed.
    pub source: String,
    pub expr: Expr,
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
    pub select: Option<Select>,
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
    /// How many of the lowest and highest dice this group drops.
    pub fn drops(&self) -> (i64, i64) {
        match self.select {
            None => (0, 0),
            Some(Select { kind, n }) => match kind {
                SelectKind::DropLowest => (n, 0),
                SelectKind::DropHighest => (0, n),
                SelectKind::KeepHighest => (self.count - n, 0),
                SelectKind::KeepLowest => (0, self.count - n),
            },
        }
    }
}
