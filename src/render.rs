//! Human-readable renderers over the result tree: the one-line default and
//! the `-v` breakdown, with optional ANSI styling.

use clap::ValueEnum;
use rollin::{BinOp, Die, Node, Roll, Status};

/// The `--color` flag.
#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum ColorChoice {
    Auto,
    Always,
    Never,
}

/// Decides whether to emit ANSI codes. Precedence: `--color never`, then
/// `--color always`, then a non-empty `NO_COLOR`, then whether stdout is a
/// terminal.
pub fn color_enabled(choice: ColorChoice, no_color: Option<&str>, stdout_is_tty: bool) -> bool {
    match choice {
        ColorChoice::Never => false,
        ColorChoice::Always => true,
        ColorChoice::Auto => no_color.is_none_or(str::is_empty) && stdout_is_tty,
    }
}

/// Applies (or skips) ANSI styling.
#[derive(Clone, Copy)]
pub struct Painter {
    pub on: bool,
}

impl Painter {
    fn wrap(self, code: &str, text: &str) -> String {
        if self.on {
            format!("\x1b[{code}m{text}\x1b[0m")
        } else {
            text.to_string()
        }
    }

    fn dim(self, text: &str) -> String {
        self.wrap("2", text)
    }

    fn bold(self, text: &str) -> String {
        self.wrap("1", text)
    }
}

/// A natural result on a lone d20.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Natural {
    Twenty,
    One,
}

/// Whether the whole roll is a single d20 (one die, 20 sides), optionally
/// with flat `+`/`-` numbers, and which natural it rolled. Nothing cleverer.
fn natural(expr: &Node) -> Option<Natural> {
    let dice = match expr {
        Node::Dice { .. } => expr,
        Node::Chain { first, rest, .. } => {
            let mut dice_nodes = std::iter::once(&**first)
                .chain(rest.iter().map(|l| &l.node))
                .filter(|n| !matches!(n, Node::Number { .. }));
            let only = dice_nodes.next()?;
            if dice_nodes.next().is_some() {
                return None;
            }
            let additive = rest.iter().all(|l| matches!(l.op, BinOp::Add | BinOp::Sub));
            if !additive {
                return None;
            }
            only
        }
        _ => return None,
    };
    let Node::Dice { sides, dice, .. } = dice else {
        return None;
    };
    if dice.len() != 1 || *sides != 20 || dice[0].parts.len() > 1 {
        return None;
    }
    match dice[0].value {
        20 => Some(Natural::Twenty),
        1 => Some(Natural::One),
        _ => None,
    }
}

/// How a die's status reads in the `-v` breakdown. Exhaustive on purpose:
/// new statuses (exploded, rerolled) must be given a word here.
fn status_label(status: Status) -> &'static str {
    match status {
        Status::Kept => "kept",
        Status::Dropped => "dropped",
        Status::Exploded => "exploded",
    }
}

/// Styles a die's text by its status and any natural highlight.
fn paint_die(p: Painter, die: &Die, nat: Option<Natural>, text: &str) -> String {
    match (die.status, nat) {
        (Status::Dropped, _) => p.dim(text),
        (_, Some(Natural::Twenty)) => p.wrap("1;32", text),
        (_, Some(Natural::One)) => p.wrap("1;31", text),
        _ => text.to_string(),
    }
}

fn has_dice(node: &Node) -> bool {
    match node {
        Node::Number { .. } => false,
        Node::Dice { .. } => true,
        Node::Neg { operand, .. } => has_dice(operand),
        Node::Group { inner, .. } => has_dice(inner),
        Node::Chain { first, rest, .. } => {
            has_dice(first) || rest.iter().any(|l| has_dice(&l.node))
        }
    }
}

/// Shows each dice group's dice (dropped in parentheses), joined by the
/// formula's operators.
fn expr_line(p: Painter, node: &Node, nat: Option<Natural>) -> String {
    match node {
        Node::Number { value } => value.to_string(),
        Node::Dice { dice, .. } => {
            let cells: Vec<String> = dice
                .iter()
                .map(|d| {
                    let text = match d.status {
                        Status::Dropped => format!("({})", d.value),
                        _ => d.value.to_string(),
                    };
                    paint_die(p, d, nat, &text)
                })
                .collect();
            format!("[{}]", cells.join(", "))
        }
        Node::Neg { operand, .. } => format!("-{}", expr_line(p, operand, nat)),
        Node::Group { inner, .. } => format!("({})", expr_line(p, inner, nat)),
        Node::Chain { first, rest, .. } => {
            let mut out = expr_line(p, first, nat);
            for link in rest {
                out.push_str(&format!(
                    " {} {}",
                    link.op.symbol(),
                    expr_line(p, &link.node, nat)
                ));
            }
            out
        }
    }
}

/// The default output: one line per roll.
pub fn render_line(p: Painter, roll: &Roll) -> String {
    let total = p.bold(&roll.total.to_string());
    if !has_dice(&roll.expr) {
        return format!("{}  →  {total}", roll.formula);
    }
    let nat = natural(&roll.expr);
    format!(
        "{}  {}  →  {total}",
        roll.formula,
        expr_line(p, &roll.expr, nat)
    )
}

/// The `-v` output: one block per roll, every die with its status, each
/// term's subtotal, the operators, and the total.
pub fn render_verbose(p: Painter, roll: &Roll) -> String {
    let nat = natural(&roll.expr);
    let mut lines = vec![roll.formula.clone()];
    verbose_node(p, &roll.expr, nat, 1, "", &mut lines);
    lines.push(format!("  total: {}", p.bold(&roll.total.to_string())));
    lines.join("\n")
}

/// Appends `node` at `depth`; `lead` is the operator that introduces it.
fn verbose_node(
    p: Painter,
    node: &Node,
    nat: Option<Natural>,
    depth: usize,
    lead: &str,
    out: &mut Vec<String>,
) {
    let pad = "  ".repeat(depth);
    match node {
        Node::Number { value } => out.push(format!("{pad}{lead}{value}")),
        Node::Dice {
            term,
            dice,
            subtotal,
            ..
        } => {
            let cells: Vec<String> = dice
                .iter()
                .map(|d| {
                    let text = format!("{} {}", d.value, status_label(d.status));
                    paint_die(p, d, nat, &text)
                })
                .collect();
            out.push(format!(
                "{pad}{lead}{term}: {} = {subtotal}",
                cells.join(", ")
            ));
        }
        Node::Neg { operand, total } => {
            out.push(format!("{pad}{lead}-("));
            verbose_node(p, operand, nat, depth + 1, "", out);
            out.push(format!("{pad}) = {total}"));
        }
        Node::Group { inner, total } => {
            out.push(format!("{pad}{lead}("));
            verbose_node(p, inner, nat, depth + 1, "", out);
            out.push(format!("{pad}) = {total}"));
        }
        Node::Chain { first, rest, .. } => {
            operand(p, first, nat, depth, lead, out);
            for link in rest {
                let lead = format!("{} ", link.op.symbol());
                operand(p, &link.node, nat, depth, &lead, out);
            }
        }
    }
}

/// A chain operand. A nested chain (from operator precedence, as in `2+3*4`)
/// is bracketed so its subtotal is visible and it reads as one unit.
fn operand(
    p: Painter,
    node: &Node,
    nat: Option<Natural>,
    depth: usize,
    lead: &str,
    out: &mut Vec<String>,
) {
    match node {
        Node::Chain { total, .. } => {
            let pad = "  ".repeat(depth);
            out.push(format!("{pad}{lead}("));
            verbose_node(p, node, nat, depth + 1, "", out);
            out.push(format!("{pad}) = {total}"));
        }
        _ => verbose_node(p, node, nat, depth, lead, out),
    }
}
