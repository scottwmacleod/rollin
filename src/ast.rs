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
