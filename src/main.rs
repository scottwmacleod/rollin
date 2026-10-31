mod render;

use clap::Parser;
use render::{color_enabled, render_line, render_verbose, ColorChoice, Painter};
use rollin::{
    entropy_rng, execute, parse_command, seeded_rng, CommandError, Context, Error, Output, Roll,
};
use serde::Serialize;
use std::io::IsTerminal;
use std::path::PathBuf;
use std::process::ExitCode;

/// A dice roller for the command line.
#[derive(Parser)]
#[command(version)]
struct Args {
    /// A formula to roll, e.g. d20 or "4d6dl1, d20+5", a preset name, or a
    /// command: save, presets, delete, import, roll
    #[arg(required = true)]
    words: Vec<String>,

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
struct JsonOutput {
    schema_version: u32,
    rolls: Vec<Roll>,
}

fn main() -> ExitCode {
    let args = Args::parse();
    let ctx = Context {
        config_dir: config_dir(),
    };
    let command = match parse_command(&args.words) {
        Ok(command) => command,
        Err(e) => return fail(&e),
    };
    let result = match args.seed {
        Some(seed) => execute(&command, &ctx, &mut seeded_rng(seed)),
        None => execute(&command, &ctx, &mut entropy_rng()),
    };
    match result {
        Ok(output) => {
            show(&args, output);
            ExitCode::SUCCESS
        }
        Err(e) => fail(&e),
    }
}

/// `$XDG_CONFIG_HOME`, else `$HOME/.config`.
fn config_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("XDG_CONFIG_HOME") {
        return PathBuf::from(dir);
    }
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config")
}

fn fail(e: &CommandError) -> ExitCode {
    match e {
        CommandError::Formula { source, error } => eprint!("{}", render_error(source, error)),
        other => eprintln!("error: {other}"),
    }
    ExitCode::FAILURE
}

fn show(args: &Args, output: Output) {
    match output {
        Output::Rolls(rolls) => show_rolls(args, rolls),
        Output::Saved { name, formula } => println!("saved '{name}': {formula}"),
        Output::Presets(presets) => {
            for (name, formula) in presets {
                println!("{name}  {formula}");
            }
        }
    }
}

fn show_rolls(args: &Args, rolls: Vec<Roll>) {
    if args.json {
        let out = JsonOutput {
            schema_version: SCHEMA_VERSION,
            rolls,
        };
        println!("{}", serde_json::to_string(&out).expect("serialize"));
    } else if args.quiet {
        for r in &rolls {
            println!("{}", r.total);
        }
    } else {
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
