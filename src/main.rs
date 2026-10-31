use clap::Parser;
use rollin::{entropy_rng, roll, seeded_rng, Roll};
use serde::Serialize;
use std::process::ExitCode;

/// A dice roller for the command line.
#[derive(Parser)]
#[command(version)]
struct Args {
    /// Formula to roll, e.g. d20
    formula: String,

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
    let dice: Vec<String> = roll.dice.iter().map(|d| d.value.to_string()).collect();
    format!("{}  [{}]  →  {}", roll.formula, dice.join(" "), roll.total)
}

fn main() -> ExitCode {
    let args = Args::parse();
    let result = match args.seed {
        Some(seed) => roll(&args.formula, &mut seeded_rng(seed)),
        None => roll(&args.formula, &mut entropy_rng()),
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
