//! The syntax tree a formula parses into. Evaluation walks this tree.

use serde::Serialize;
use std::ops::Range;

/// A parsed formula: an optional repeat count and the rolls it applies to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Formula {
    /// The `N` of a leading `Nx`; `None` when the formula is not repeated.
    pub repeat: Option<u32>,
    pub rolls: Vec<Roll>,
}

/// One comma-separated roll of a formula, before it is evaluated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Roll {
    /// The roll's source text, trimmed.
    pub source: String,
    pub expr: Arith,
    /// The `# text` note on this roll, trimmed.
    pub label: Option<String>,
    /// The `atk` / `dmg` suffix marker, if the roll has one. Only a game
    /// system reads it; without one it changes nothing.
    pub role: Option<Role>,
    /// The `crit` suffix: this roll's dice are doubled by hand, with or
    /// without a game system.
    pub crit: bool,
}

/// What a roll is in a game system's attack-and-damage pairing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// A d20 check that can hit or miss.
    Attack,
    /// Damage dealt by the nearest preceding attack.
    Damage,
}

impl Roll {
    /// The role a game system gives this roll: the marker if it has one,
    /// else attack for a single d20 check and damage for dice with no d20.
    pub fn role(&self) -> Option<Role> {
        self.role.or_else(|| {
            if self.expr.is_d20_check() {
                Some(Role::Attack)
            } else if self.expr.d20_terms() == 0 && self.expr.has_dice() {
                Some(Role::Damage)
            } else {
                None
            }
        })
    }
}

/// Arithmetic over terms, with the byte range of the source it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Arith {
    pub kind: ArithKind,
    pub span: Range<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArithKind {
    Number(i64),
    Dice(DiceTerm),
    Neg(Box<Arith>),
    /// A parenthesised group.
    Group(Box<Arith>),
    /// Operands joined by operators of one precedence level, evaluated left
    /// to right. Chains are flat so long formulas do not nest deeply.
    Chain {
        first: Box<Arith>,
        rest: Vec<(BinOp, Arith)>,
    },
}

impl Arith {
    /// Whether any dice are rolled anywhere in this arithmetic.
    pub fn has_dice(&self) -> bool {
        match &self.kind {
            ArithKind::Number(_) => false,
            ArithKind::Dice(_) => true,
            ArithKind::Neg(inner) | ArithKind::Group(inner) => inner.has_dice(),
            ArithKind::Chain { first, rest } => {
                first.has_dice() || rest.iter().any(|(_, e)| e.has_dice())
            }
        }
    }

    /// How many d20 groups this arithmetic holds, of any kind.
    fn d20_terms(&self) -> usize {
        match &self.kind {
            ArithKind::Number(_) => 0,
            ArithKind::Dice(d) => usize::from(d.sides == 20),
            ArithKind::Neg(inner) | ArithKind::Group(inner) => inner.d20_terms(),
            ArithKind::Chain { first, rest } => {
                first.d20_terms() + rest.iter().map(|(_, e)| e.d20_terms()).sum::<usize>()
            }
        }
    }

    /// Whether this is a d20 check: the one definition behind both a roll's
    /// attack role and its natural 20 / natural 1 verdict.
    ///
    /// The arithmetic holds exactly one d20 group, and that group is a check
    /// die (see [`DiceTerm::is_check_die`]). Other terms, such as the
    /// modifier in `d20+5`, do not matter.
    pub fn is_d20_check(&self) -> bool {
        fn check_die(a: &Arith) -> Option<&DiceTerm> {
            match &a.kind {
                ArithKind::Dice(d) if d.sides == 20 => Some(d),
                ArithKind::Neg(inner) | ArithKind::Group(inner) => check_die(inner),
                ArithKind::Chain { first, rest } => std::iter::once(&**first)
                    .chain(rest.iter().map(|(_, e)| e))
                    .find_map(check_die),
                _ => None,
            }
        }
        self.d20_terms() == 1 && check_die(self).is_some_and(DiceTerm::is_check_die)
    }

    /// Whether this is a success count (a dice group with a
    /// success clause, possibly parenthesised).
    pub fn is_count(&self) -> bool {
        match &self.kind {
            ArithKind::Dice(d) => d.success.is_some(),
            ArithKind::Group(inner) => inner.is_count(),
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
pub struct DiceTerm {
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
    /// The source text of each clause, for reporting why a die is what it is.
    pub clauses: Clauses,
}

/// The modifiers of a dice group as written, e.g. `r1`, `!`, `kh2`, `>=8f1`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Clauses {
    pub reroll: Option<String>,
    pub explode: Option<String>,
    /// The keep/drop clause, or `adv` / `dis`.
    pub select: Option<String>,
    pub success: Option<String>,
}

impl Clauses {
    /// Every clause present, in the order they are applied.
    pub fn list(&self) -> Vec<String> {
        [&self.reroll, &self.explode, &self.select, &self.success]
            .into_iter()
            .flatten()
            .cloned()
            .collect()
    }
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

impl DiceTerm {
    /// Whether this d20 group can be a check: a lone `d20`, or two d20s of
    /// which exactly one is kept (`adv`, `dis`, `kh1`, `kl1`, `dl1`, `dh1`).
    /// Three or more d20s, a bare `2d20` and a success count are never a
    /// check. Rerolls are fine: the die that stands is the result. So is an
    /// explode clause on the kept pair, but a lone exploding d20 is not, since
    /// its pool can grow past one die.
    pub fn is_check_die(&self) -> bool {
        let one_kept = matches!(self.select, Some(Select { n: 1, .. }));
        self.sides == 20
            && self.success.is_none()
            && ((self.count == 1 && self.explode.is_none()) || (self.count == 2 && one_kept))
    }

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_with;

    fn role(formula: &str) -> Option<Role> {
        let parsed = parse_with(formula, &|_| None).unwrap();
        parsed.rolls[0].role()
    }

    /// The d20 check definition decides the attack role, one formula at a time.
    #[test]
    fn a_d20_check_is_an_attack_and_nothing_else_is() {
        for check in [
            "d20",
            "d20+5",
            "1d20-2",
            "d20adv+5",
            "d20dis",
            "2d20kh1+5",
            "2d20kl1",
            "2d20dl1",
            "2d20dh1",
            "d20r1+5",
            "d20rr1+5",
            "2d20!kh1",
            "(d20+5)*2",
        ] {
            assert_eq!(role(check), Some(Role::Attack), "{check}");
        }
        for not_check in [
            "3d20+5", "2d20", "2d20+5", "3d20kh1", "6d20>=15", "d20>=15", "d20!", "d20+d20",
        ] {
            assert_ne!(role(not_check), Some(Role::Attack), "{not_check}");
        }
        assert_eq!(role("3d20+5"), None);
        assert_eq!(role("d20+d20"), None);
    }
}
