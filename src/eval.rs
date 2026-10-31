//! Evaluator: walks the AST, drawing dice from the injected RNG.

use crate::ast::{BinOp, ExplodeMode, Expr, ExprKind, Item, RerollMode};
use crate::error::Error;
use crate::{Die, Kind, Link, Node, Outcome, Roll, Status, Tally};
use rand::Rng;
use std::ops::Range;

/// Hard limit (ADR 0006): extra dice one original die may roll.
const MAX_EXPLOSIONS_PER_DIE: usize = 100;

/// Hard limit (ADR 0006): rerolls of one die under `rr`.
const MAX_REROLLS_PER_DIE: usize = 100;

/// Hard limit (ADR 0006): dice rolled by one roll, extra explosion dice
/// included.
const MAX_DICE_PER_EXPRESSION: usize = 10000;

/// State threaded through one roll's evaluation.
struct Ctx<'a, R> {
    rng: &'a mut R,
    /// Dice rolled so far, explosions included.
    rolled: usize,
}

impl<R: Rng> Ctx<'_, R> {
    /// Rolls one die, counting it toward the per-expression cap.
    fn die(&mut self, sides: i64, term: &str, span: &Range<usize>) -> Result<u32, Error> {
        self.rolled += 1;
        if self.rolled > MAX_DICE_PER_EXPRESSION {
            return Err(Error::LimitExceeded {
                cap: "dice per expression",
                limit: MAX_DICE_PER_EXPRESSION,
                term: term.to_string(),
                span: span.clone(),
            });
        }
        Ok(self.rng.gen_range(1..=sides as u32))
    }
}

pub fn evaluate(item: &Item, rng: &mut impl Rng) -> Result<Roll, Error> {
    let mut ctx = Ctx { rng, rolled: 0 };
    let expr = eval_expr(&item.expr, &mut ctx)?;
    Ok(Roll {
        formula: item.source.clone(),
        kind: if expr.is_count() {
            Kind::Count
        } else {
            Kind::Sum
        },
        total: expr.total(),
        expr,
    })
}

fn eval_expr(expr: &Expr, ctx: &mut Ctx<'_, impl Rng>) -> Result<Node, Error> {
    match &expr.kind {
        ExprKind::Number(n) => Ok(Node::Number { value: *n }),
        ExprKind::Dice(d) => {
            let mut dice = Vec::new();
            for _ in 0..d.count {
                let mut raw = ctx.die(d.sides, &d.text, &expr.span)?;
                if let Some(reroll) = d.reroll {
                    let mut rerolls = 0;
                    while reroll.triggers(i64::from(raw)) {
                        if rerolls == MAX_REROLLS_PER_DIE {
                            return Err(Error::LimitExceeded {
                                cap: "rerolls per die",
                                limit: MAX_REROLLS_PER_DIE,
                                term: d.text.clone(),
                                span: expr.span.clone(),
                            });
                        }
                        rerolls += 1;
                        dice.push(Die {
                            value: raw,
                            status: Status::Rerolled,
                            parts: Vec::new(),
                            outcome: None,
                        });
                        raw = ctx.die(d.sides, &d.text, &expr.span)?;
                        if reroll.mode == RerollMode::Once {
                            break;
                        }
                    }
                }
                let mut die = Die {
                    value: raw,
                    status: Status::Kept,
                    parts: Vec::new(),
                    outcome: None,
                };
                let mut extras = Vec::new();
                let mut explosions = 0;
                while d.explode.is_some_and(|e| e.triggers(i64::from(raw))) {
                    if explosions == MAX_EXPLOSIONS_PER_DIE {
                        return Err(Error::LimitExceeded {
                            cap: "explosions per die",
                            limit: MAX_EXPLOSIONS_PER_DIE,
                            term: d.text.clone(),
                            span: expr.span.clone(),
                        });
                    }
                    explosions += 1;
                    raw = ctx.die(d.sides, &d.text, &expr.span)?;
                    extras.push(raw);
                }
                if d.explode.is_some_and(|e| e.mode == ExplodeMode::Compound) && !extras.is_empty()
                {
                    die.parts = std::iter::once(die.value).chain(extras).collect();
                    die.value = die.parts.iter().sum();
                    dice.push(die);
                } else {
                    dice.push(die);
                    let penetrate = d.explode.is_some_and(|e| e.mode == ExplodeMode::Penetrate);
                    dice.extend(extras.into_iter().map(|raw| Die {
                        // A penetrating extra die counts one less, with no floor.
                        value: raw - u32::from(penetrate),
                        status: Status::Exploded,
                        parts: Vec::new(),
                        outcome: None,
                    }));
                }
            }
            let pool = dice.iter().filter(|d| d.status != Status::Rerolled).count();
            apply_drops(&mut dice, d.drops(pool));
            let mut tally = None;
            let subtotal = match d.success {
                Some(success) => {
                    let mut successes = 0;
                    for die in dice.iter_mut().filter(|d| d.status.counts()) {
                        if success.succeeds(i64::from(die.value)) {
                            die.outcome = Some(Outcome::Success);
                            successes += 1;
                        }
                    }
                    tally = Some(Tally {
                        kind: Kind::Count,
                        successes,
                        failures: 0,
                    });
                    successes
                }
                None => dice
                    .iter()
                    .filter(|d| d.status.counts())
                    .map(|d| i64::from(d.value))
                    .sum(),
            };
            Ok(Node::Dice {
                term: d.text.clone(),
                sides: d.sides,
                dice,
                subtotal,
                tally,
            })
        }
        ExprKind::Neg(inner) => {
            let operand = eval_expr(inner, ctx)?;
            let total = operand.total().checked_neg().ok_or(Error::Overflow {
                span: expr.span.clone(),
            })?;
            Ok(Node::Neg {
                operand: Box::new(operand),
                total,
            })
        }
        ExprKind::Group(inner) => {
            let inner = eval_expr(inner, ctx)?;
            Ok(Node::Group {
                total: inner.total(),
                inner: Box::new(inner),
            })
        }
        ExprKind::Chain { first, rest } => {
            let first_span = first.span.clone();
            let first = eval_expr(first, ctx)?;
            let mut total = first.total();
            let mut links = Vec::with_capacity(rest.len());
            for (op, operand) in rest {
                let node = eval_expr(operand, ctx)?;
                let span = first_span.start..operand.span.end;
                total = apply(*op, total, node.total(), span, operand.span.clone())?;
                links.push(Link { op: *op, node });
            }
            Ok(Node::Chain {
                first: Box::new(first),
                rest: links,
                total,
            })
        }
    }
}

/// Applies one operator with checked arithmetic. `span` covers the whole
/// operation (for overflow); `rhs_span` is the right operand (for division
/// by zero).
fn apply(
    op: BinOp,
    lhs: i64,
    rhs: i64,
    span: Range<usize>,
    rhs_span: Range<usize>,
) -> Result<i64, Error> {
    if op == BinOp::Div && rhs == 0 {
        return Err(Error::DivisionByZero { span: rhs_span });
    }
    match op {
        BinOp::Add => lhs.checked_add(rhs),
        BinOp::Sub => lhs.checked_sub(rhs),
        BinOp::Mul => lhs.checked_mul(rhs),
        // Rust integer division truncates toward zero.
        BinOp::Div => lhs.checked_div(rhs),
    }
    .ok_or(Error::Overflow { span })
}

/// Marks the lowest and highest dice as dropped. Ties are broken by roll
/// order (stable sort), matching v1.
fn apply_drops(dice: &mut [Die], (lowest, highest): (i64, i64)) {
    let mut order: Vec<usize> = (0..dice.len())
        .filter(|&i| dice[i].status != Status::Rerolled)
        .collect();
    order.sort_by_key(|&i| dice[i].value);
    let (lowest, highest) = (lowest as usize, highest as usize);
    for &i in order.iter().take(lowest) {
        dice[i].status = Status::Dropped;
    }
    for &i in order.iter().skip(order.len() - highest) {
        dice[i].status = Status::Dropped;
    }
}
