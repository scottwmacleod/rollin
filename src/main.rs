use clap::Parser;
use rollin::{entropy_rng, roll, seeded_rng, Node, Roll, Status};
use serde::Serialize;
use std::process::ExitCode;

/// A dice roller for the command line.
#[derive(Parser)]
#[command(version)]
struct Args {
    /// Formula to roll, e.g. d20 or "4d6dl1, d20+5" (words are joined with spaces)
    #[arg(required = true)]
    formula: Vec<String>,

    /// Seed the random number generator for reproducible rolls
    #[arg(long)]
    seed: Option<u64>,

    /// Print the result tree as JSON
    #[arg(long)]
    json: bool,
}

#[derive(Serialize)]
struct Output {
    rolls: Vec<Roll>,
}

/// Shows each dice group's dice (dropped in parentheses), joined by the
/// formula's operators.
fn render_expr(node: &Node) -> String {
    match node {
        Node::Number { value } => value.to_string(),
        Node::Dice { dice, .. } => {
            let cells: Vec<String> = dice
                .iter()
                .map(|d| match d.status {
                    Status::Kept => d.value.to_string(),
                    Status::Dropped => format!("({})", d.value),
                })
                .collect();
            format!("[{}]", cells.join(", "))
        }
        Node::Neg { operand, .. } => format!("-{}", render_expr(operand)),
        Node::Chain { first, rest, .. } => {
            let mut out = render_expr(first);
            for link in rest {
                out.push_str(&format!(" {} {}", link.op.symbol(), render_expr(&link.node)));
            }
            out
        }
    }
}

fn has_dice(node: &Node) -> bool {
    match node {
        Node::Number { .. } => false,
        Node::Dice { .. } => true,
        Node::Neg { operand, .. } => has_dice(operand),
        Node::Chain { first, rest, .. } => {
            has_dice(first) || rest.iter().any(|l| has_dice(&l.node))
        }
    }
}

fn render(roll: &Roll) -> String {
    if !has_dice(&roll.expr) {
        return format!("{}  →  {}", roll.formula, roll.total);
    }
    format!(
        "{}  {}  →  {}",
        roll.formula,
        render_expr(&roll.expr),
        roll.total
    )
}

fn main() -> ExitCode {
    let args = Args::parse();
    let formula = args.formula.join(" ");
    let result = match args.seed {
        Some(seed) => roll(&formula, &mut seeded_rng(seed)),
        None => roll(&formula, &mut entropy_rng()),
    };
    match result {
        Ok(rolls) if args.json => {
            let out = Output { rolls };
            println!("{}", serde_json::to_string(&out).expect("serialize"));
            ExitCode::SUCCESS
        }
        Ok(rolls) => {
            for r in &rolls {
                println!("{}", render(r));
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}
