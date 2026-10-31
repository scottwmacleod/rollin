use clap::Parser;
use rollin::{entropy_rng, roll, seeded_rng, Roll, Status};
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

fn render(roll: &Roll) -> String {
    if roll.dice.is_empty() {
        return format!("{}  →  {}", roll.formula, roll.total);
    }
    let dice: Vec<String> = roll
        .dice
        .iter()
        .map(|d| match d.status {
            Status::Kept => d.value.to_string(),
            Status::Dropped => format!("({})", d.value),
        })
        .collect();
    let modifier = match roll.modifier {
        0 => String::new(),
        m if m > 0 => format!(" + {m}"),
        m => format!(" - {}", m.unsigned_abs()),
    };
    format!(
        "{}  [{}]{}  →  {}",
        roll.formula,
        dice.join(", "),
        modifier,
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
