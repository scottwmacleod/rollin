//! Human-readable renderers over the result tree: the one-line default and
//! the `-v` breakdown, with optional ANSI styling.

use clap::ValueEnum;
use rollin::{BinOp, Die, Node, Outcome, Roll, Status, Tally};

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

    /// Dim and crossed out: a die a reroll replaced.
    fn struck(self, text: &str) -> String {
        self.wrap("2;9", text)
    }

    fn green(self, text: &str) -> String {
        self.wrap("32", text)
    }

    fn red(self, text: &str) -> String {
        self.wrap("31", text)
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
    // Dice a reroll replaced are history; only the one that stands counts.
    let dice: Vec<&Die> = dice
        .iter()
        .filter(|d| d.status != Status::Rerolled)
        .collect();
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
        Status::Rerolled => "rerolled",
    }
}

/// Styles a die's text by its status and any natural highlight.
fn paint_die(p: Painter, die: &Die, nat: Option<Natural>, text: &str) -> String {
    match (die.status, nat) {
        (Status::Rerolled, _) => p.struck(text),
        (Status::Dropped, _) => p.dim(text),
        (_, _) if die.outcome == Some(Outcome::Success) => p.green(text),
        (_, _) if die.outcome == Some(Outcome::Failure) => p.red(text),
        (_, Some(Natural::Twenty)) => p.wrap("1;32", text),
        (_, Some(Natural::One)) => p.wrap("1;31", text),
        _ => text.to_string(),
    }
}

/// `✓` after a success, `✗` after a failure, nothing otherwise.
fn outcome_mark(outcome: Option<Outcome>) -> &'static str {
    match outcome {
        Some(Outcome::Success) => "✓",
        Some(Outcome::Failure) => "✗",
        None => "",
    }
}

/// `3 successes`, `1 success`; with failures the net is followed by the
/// breakdown: `2 successes (3 - 1 failure)`.
fn count_label(tally: &Tally) -> String {
    let net = tally.successes - tally.failures;
    let noun = if net.abs() == 1 {
        "success"
    } else {
        "successes"
    };
    if tally.failures == 0 {
        return format!("{net} {noun}");
    }
    let fail_noun = if tally.failures == 1 {
        "failure"
    } else {
        "failures"
    };
    format!(
        "{net} {noun} ({} - {} {fail_noun})",
        tally.successes, tally.failures
    )
}

/// The roll's total as shown: a plain number for a sum, a labelled tally for
/// a success count.
fn total_text(roll: &Roll) -> String {
    match roll.expr.tally() {
        Some(tally) => count_label(tally),
        None => roll.total.to_string(),
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

/// Shows each dice group's dice (dropped in parentheses, rerolled-away dice
/// between tildes), joined by the
/// formula's operators.
fn expr_line(p: Painter, node: &Node, nat: Option<Natural>) -> String {
    match node {
        Node::Number { value } => value.to_string(),
        Node::Dice { dice, .. } => {
            let cells: Vec<String> = dice
                .iter()
                .map(|d| {
                    // A trailing `!` marks a die that came from an explosion.
                    let bang = if d.status == Status::Exploded || d.parts.len() > 1 {
                        "!"
                    } else {
                        ""
                    };
                    // A trailing mark shows a success-count die's outcome.
                    let mark = outcome_mark(d.outcome);
                    let face = d.value.to_string();
                    let text = match d.status {
                        Status::Dropped => format!("({face}{bang})"),
                        Status::Rerolled => format!("~{face}~"),
                        _ => format!("{face}{bang}{mark}"),
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

/// The roll's label as it trails a line: two spaces then `# text`, dimmed.
fn label_suffix(p: Painter, roll: &Roll) -> String {
    roll.label
        .as_ref()
        .map_or(String::new(), |l| format!("  {}", p.dim(&format!("# {l}"))))
}

/// The default output: one line per roll.
pub fn render_line(p: Painter, roll: &Roll) -> String {
    let total = p.bold(&total_text(roll));
    let label = label_suffix(p, roll);
    if !has_dice(&roll.expr) {
        return format!("{}  →  {total}{label}", roll.formula);
    }
    let nat = natural(&roll.expr);
    format!(
        "{}  {}  →  {total}{label}",
        roll.formula,
        expr_line(p, &roll.expr, nat)
    )
}

/// The `-v` output: one block per roll, every die with its status, each
/// term's subtotal, the operators, and the total.
pub fn render_verbose(p: Painter, roll: &Roll) -> String {
    let nat = natural(&roll.expr);
    let mut lines = vec![format!("{}{}", roll.formula, label_suffix(p, roll))];
    verbose_node(p, &roll.expr, nat, 1, "", &mut lines);
    lines.push(format!("  total: {}", p.bold(&total_text(roll))));
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
            tally,
            ..
        } => {
            let cells: Vec<String> = dice
                .iter()
                .map(|d| {
                    let mut text = format!("{} {}", d.value, status_label(d.status));
                    match d.outcome {
                        Some(Outcome::Success) => text.push_str(" success"),
                        Some(Outcome::Failure) => text.push_str(" failure"),
                        None => {}
                    }
                    if d.parts.len() > 1 {
                        let parts: Vec<String> = d.parts.iter().map(i64::to_string).collect();
                        text.push_str(&format!(" ({})", parts.join("+")));
                    }
                    paint_die(p, d, nat, &text)
                })
                .collect();
            out.push(format!(
                "{pad}{lead}{term}: {} = {subtotal}",
                cells.join(", ")
            ));
            if let Some(t) = tally {
                out.push(format!(
                    "{pad}  successes: {}, failures: {}, net: {subtotal}",
                    t.successes, t.failures
                ));
            }
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
