//! Evaluator: walks the AST, drawing dice from the injected RNG.

use crate::ast::{BinOp, Expr, Item};
use crate::error::Error;
use crate::{Die, Roll, Status};
use rand::Rng;

struct Evaluated {
    dice: Vec<Die>,
    /// Sum of the flat numbers added in.
    modifier: i64,
    total: i64,
}

pub fn evaluate(item: &Item, rng: &mut impl Rng) -> Result<Roll, Error> {
    let e = eval_expr(&item.expr, rng)?;
    Ok(Roll {
        formula: item.source.clone(),
        dice: e.dice,
        modifier: e.modifier,
        total: e.total,
    })
}

fn eval_expr(expr: &Expr, rng: &mut impl Rng) -> Result<Evaluated, Error> {
    match expr {
        Expr::Number(n) => Ok(Evaluated {
            dice: Vec::new(),
            modifier: *n,
            total: *n,
        }),
        Expr::Dice(d) => {
            let dice: Vec<Die> = (0..d.count)
                .map(|_| Die {
                    value: rng.gen_range(1..=d.sides as u32),
                    status: Status::Kept,
                })
                .collect();
            let total = dice.iter().map(|d| i64::from(d.value)).sum();
            Ok(Evaluated {
                dice,
                modifier: 0,
                total,
            })
        }
        Expr::Binary { op, lhs, rhs } => {
            let mut l = eval_expr(lhs, rng)?;
            let r = eval_expr(rhs, rng)?;
            let (modifier, total) = match op {
                BinOp::Add => (
                    l.modifier.checked_add(r.modifier),
                    l.total.checked_add(r.total),
                ),
                BinOp::Sub => (
                    l.modifier.checked_sub(r.modifier),
                    l.total.checked_sub(r.total),
                ),
            };
            l.dice.extend(r.dice);
            Ok(Evaluated {
                dice: l.dice,
                modifier: modifier.ok_or(Error::Overflow)?,
                total: total.ok_or(Error::Overflow)?,
            })
        }
    }
}
