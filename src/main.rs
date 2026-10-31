mod render;

use clap::Parser;
use render::{color_enabled, render_line, render_verbose, ColorChoice, Painter};
use rollin::{entropy_rng, roll, seeded_rng, Error, Roll};
use serde::Serialize;
use std::io::IsTerminal;
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

    /// Print the result tree as JSON (ignores -q and -v)
    #[arg(long)]
    json: bool,

    /// Print only the total of each roll, one per line
    #[arg(short, long, conflicts_with = "verbose")]
    quiet: bool,

    /// When to colorize human output: never beats always, which beats
    /// NO_COLOR, which beats terminal detection (auto)
    #[arg(long, value_enum, default_value = "auto")]
    color: ColorChoice,

    /// Show the full breakdown of each roll
    #[arg(short, long)]
    verbose: bool,
}

/// Version of the `--json` schema (see docs/json-schema.md). Bump on any
/// change to the shape or meaning of existing fields.
const SCHEMA_VERSION: u32 = 1;

#[derive(Serialize)]
struct Output {
    schema_version: u32,
    rolls: Vec<Roll>,
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
            let out = Output {
                schema_version: SCHEMA_VERSION,
                rolls,
            };
            println!("{}", serde_json::to_string(&out).expect("serialize"));
            ExitCode::SUCCESS
        }
        Ok(rolls) if args.quiet => {
            for r in &rolls {
                println!("{}", r.total);
            }
            ExitCode::SUCCESS
        }
        Ok(rolls) => {
            let no_color = std::env::var("NO_COLOR").ok();
            let on = color_enabled(
                args.color,
                no_color.as_deref(),
                std::io::stdout().is_terminal(),
            );
            let paint = Painter { on };
            if args.verbose {
                let blocks: Vec<String> = rolls.iter().map(|r| render_verbose(paint, r)).collect();
                println!("{}", blocks.join("\n\n"));
            } else {
                for r in &rolls {
                    println!("{}", render_line(paint, r));
                }
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprint!("{}", render_error(&formula, &e));
            ExitCode::FAILURE
        }
    }
}

/// The message, the formula, and carets under the offending span.
fn render_error(formula: &str, error: &Error) -> String {
    let span = error.span();
    // Show control characters (e.g. a newline) as spaces so the line and the
    // carets stay aligned.
    let line: String = formula
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let start = formula[..span.start].chars().count();
    let len = formula[span.start..span.end].chars().count().max(1);
    format!(
        "error: {error}\n  {line}\n  {}{}\n",
        " ".repeat(start),
        "^".repeat(len)
    )
}
