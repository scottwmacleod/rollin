//! The syntax tree a formula parses into. Evaluation walks this tree.

/// One comma-separated item of a formula: a single roll.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Item {
    /// The item's source text, trimmed.
    pub source: String,
    pub expr: Expr,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr {
    Number(i64),
    Dice(Dice),
    Binary {
        op: BinOp,
        lhs: Box<Expr>,
        rhs: Box<Expr>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinOp {
    Add,
    Sub,
}

/// A dice group such as `4d6dl1`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dice {
    pub count: i64,
    pub sides: i64,
}
