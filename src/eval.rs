//! Evaluator: walks the AST, drawing dice from the injected RNG.

use crate::ast::{BinOp, Dice, ExplodeMode, Expr, ExprKind, Item, RerollMode};
use crate::error::Error;
use crate::limits::{Cap, MAX_DICE_PER_EXPRESSION, MAX_EXPLOSIONS_PER_DIE, MAX_REROLLS_PER_DIE};
use crate::{Die, Kind, Link, Natural, Node, Outcome, Reason, Roll, Status, Tally};
use rand::Rng;
use std::ops::Range;

/// State threaded through one roll's evaluation.
struct Ctx<'a, R> {
    rng: &'a mut R,
    /// Dice rolled so far, explosions included.
    rolled: i64,
}

impl<R: Rng> Ctx<'_, R> {
    /// Rolls one die, counting it toward the per-expression cap.
    fn die(&mut self, dice: &Dice, span: &Range<usize>) -> Result<i64, Error> {
        self.rolled += 1;
        if self.rolled > MAX_DICE_PER_EXPRESSION {
            return Err(Error::limit_exceeded(
                Cap::DicePerExpression,
                dice.text.clone(),
                span.clone(),
            ));
        }
        Ok(i64::from(self.rng.gen_range(1..=dice.sides as u32)))
    }
}

pub fn evaluate(item: &Item, rng: &mut impl Rng) -> Result<Roll, Error> {
    let mut ctx = Ctx { rng, rolled: 0 };
    let mut expr = eval_expr(&item.expr, &mut ctx)?;
    mark_natural(&mut expr);
    Ok(Roll {
        formula: item.source.clone(),
        kind: if expr.is_count() {
            Kind::Count
        } else {
            Kind::Sum
        },
        total: expr.total(),
        expr,
        label: item.label.clone(),
        iteration: None,
    })
}

fn eval_expr(expr: &Expr, ctx: &mut Ctx<'_, impl Rng>) -> Result<Node, Error> {
    match &expr.kind {
        ExprKind::Number(n) => Ok(Node::Number { value: *n }),
        ExprKind::Dice(d) => {
            let mut dice = Vec::new();
            let reroll_reason = d.clauses.reroll.clone();
            for _ in 0..d.count {
                let mut raw = ctx.die(d, &expr.span)?;
                // The index of the last die this one's reroll replaced.
                let mut replaced = None;
                if let Some(reroll) = d.reroll {
                    let mut rerolls = 0;
                    while reroll.triggers(raw) {
                        if rerolls == MAX_REROLLS_PER_DIE {
                            return Err(Error::limit_exceeded(
                                Cap::RerollsPerDie,
                                d.text.clone(),
                                expr.span.clone(),
                            ));
                        }
                        rerolls += 1;
                        dice.push(Die {
                            value: raw,
                            status: Status::Rerolled,
                            parts: Vec::new(),
                            outcome: None,
                            natural: None,
                            reason: reroll_reason.clone().map(|c| Reason::new(&c, replaced)),
                        });
                        replaced = Some(dice.len() - 1);
                        raw = ctx.die(d, &expr.span)?;
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
                    natural: None,
                    reason: replaced
                        .and_then(|i| Some(Reason::new(reroll_reason.as_deref()?, Some(i)))),
                };
                let die_index = dice.len();
                let mut extras = Vec::new();
                let mut explosions = 0;
                while d.explode.is_some_and(|e| e.triggers(raw)) {
                    if explosions == MAX_EXPLOSIONS_PER_DIE {
                        return Err(Error::limit_exceeded(
                            Cap::ExplosionsPerDie,
                            d.text.clone(),
                            expr.span.clone(),
                        ));
                    }
                    explosions += 1;
                    raw = ctx.die(d, &expr.span)?;
                    extras.push(raw);
                }
                if d.explode.is_some_and(|e| e.mode == ExplodeMode::Compound) && !extras.is_empty()
                {
                    die.parts = std::iter::once(die.value).chain(extras).collect();
                    die.value = die.parts.iter().sum();
                    // A reroll replacement keeps its reroll reason (so the link
                    // back survives) and records the compound clause as `also`.
                    die.reason = match die.reason.take() {
                        Some(mut r) => {
                            r.also = d.clauses.explode.clone();
                            Some(r)
                        }
                        None => d.clauses.explode.as_deref().map(|c| Reason::new(c, None)),
                    };
                    dice.push(die);
                } else {
                    dice.push(die);
                    let penetrate = d.explode.is_some_and(|e| e.mode == ExplodeMode::Penetrate);
                    dice.extend(extras.into_iter().enumerate().map(|(n, raw)| {
                        Die {
                            // A penetrating extra die counts one less, with no floor.
                            value: raw - i64::from(penetrate),
                            status: Status::Exploded,
                            parts: Vec::new(),
                            outcome: None,
                            natural: None,
                            // Each extra die exploded from the die just before it.
                            reason: d
                                .clauses
                                .explode
                                .as_deref()
                                .map(|c| Reason::new(c, Some(die_index + n))),
                        }
                    }));
                }
            }
            let pool = dice.iter().filter(|d| d.status != Status::Rerolled).count();
            apply_drops(
                &mut dice,
                d.drops(pool),
                d.clauses.select.as_deref().unwrap_or_default(),
            );
            let mut tally = None;
            let subtotal = match d.success {
                Some(success) => {
                    let (mut successes, mut failures) = (0, 0);
                    for die in dice.iter_mut().filter(|d| d.status.counts()) {
                        let face = die.value;
                        if success.succeeds(face) {
                            die.outcome = Some(Outcome::Success);
                            successes += 1;
                        } else if success.fails(face) {
                            die.outcome = Some(Outcome::Failure);
                            failures += 1;
                        }
                    }
                    tally = Some(Tally {
                        kind: Kind::Count,
                        successes,
                        failures,
                    });
                    successes - failures
                }
                None => dice
                    .iter()
                    .filter(|d| d.status.counts())
                    .map(|d| d.value)
                    .sum(),
            };
            Ok(Node::Dice {
                term: d.text.clone(),
                sides: d.sides,
                modifiers: d.clauses.list(),
                special: d.special,
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
pub(crate) fn apply(
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
fn apply_drops(dice: &mut [Die], (lowest, highest): (i64, i64), clause: &str) {
    let mut order: Vec<usize> = (0..dice.len())
        .filter(|&i| dice[i].status != Status::Rerolled)
        .collect();
    order.sort_by_key(|&i| dice[i].value);
    let (lowest, highest) = (lowest as usize, highest as usize);
    for &i in order.iter().take(lowest) {
        dice[i].status = Status::Dropped;
        dice[i].reason = Some(Reason::new(clause, None));
    }
    for &i in order.iter().skip(order.len() - highest) {
        dice[i].status = Status::Dropped;
        dice[i].reason = Some(Reason::new(clause, None));
    }
}

/// Marks the kept die of a d20 check that rolled a natural 20 or 1.
///
/// A roll is a d20 check when it holds exactly one d20 term, and that term is
/// not a success count. Its result is the one die left standing: rerolled
/// dice are history and dropped dice are out, so `d20adv` and `2d20kh1` read
/// the kept die while `3d20` (three standing dice) is not a check.
fn mark_natural(root: &mut Node) {
    fn d20_terms<'a>(node: &'a mut Node, out: &mut Vec<&'a mut Node>) {
        match node {
            Node::Dice { sides: 20, .. } => out.push(node),
            Node::Dice { .. } | Node::Number { .. } => {}
            Node::Neg { operand, .. } => d20_terms(operand, out),
            Node::Group { inner, .. } => d20_terms(inner, out),
            Node::Chain { first, rest, .. } => {
                d20_terms(first, out);
                for link in rest {
                    d20_terms(&mut link.node, out);
                }
            }
        }
    }
    let mut terms = Vec::new();
    d20_terms(root, &mut terms);
    let [Node::Dice { dice, tally, .. }] = terms.as_mut_slice() else {
        return;
    };
    if tally.is_some() {
        return;
    }
    let mut standing = dice.iter_mut().filter(|d| d.status.counts());
    let (Some(die), None) = (standing.next(), standing.next()) else {
        return;
    };
    // A compounded explosion is a sum of rolls, not a face.
    if die.parts.len() > 1 {
        return;
    }
    die.natural = match die.value {
        20 => Some(Natural::Twenty),
        1 => Some(Natural::One),
        _ => None,
    };
}
