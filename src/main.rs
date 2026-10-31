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

    /// Overwrite existing presets (only for `import`; handled by the command
    /// parser, which clap would otherwise reject as an unknown flag)
    #[arg(long, hide = true)]
    force: bool,

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
    let names = &mut || -> Result<Vec<String>, CommandError> {
        Ok(ctx.store()?.load()?.into_keys().collect())
    };
    let mut words = args.words.clone();
    if args.force {
        words.push("--force".into());
    }
    let command = match parse_command(&words, names) {
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

/// `$XDG_CONFIG_HOME` if absolute, else `$HOME/.config`.
fn config_dir() -> Option<PathBuf> {
    let xdg = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from);
    let home = std::env::var_os("HOME").map(PathBuf::from);
    rollin::config_dir(xdg.as_deref(), home.as_deref())
}

fn fail(e: &CommandError) -> ExitCode {
    match e {
        CommandError::Formula { source, error } => eprint!("{}", render_error(source, error)),
        CommandError::UnknownPreset { suggestion, .. } => {
            eprintln!("error: {e}");
            if let Some(name) = suggestion {
                eprintln!("hint: did you mean '{name}'?");
            }
            eprintln!("hint: run `rollin presets` to list saved presets");
        }
        other => eprintln!("error: {other}"),
    }
    ExitCode::FAILURE
}

fn show(args: &Args, output: Output) {
    match output {
        Output::Rolls { preset, rolls } => show_rolls(args, preset, rolls),
        Output::Saved {
            name,
            formula,
            replaced: None,
        } => println!("saved '{name}': {formula}"),
        Output::Saved {
            name,
            formula,
            replaced: Some(old),
        } => println!("replaced '{name}' (was {old}): {formula}"),
        Output::Imported(report) => {
            for (name, reason) in &report.skipped {
                println!("skipped '{name}': {reason}");
            }
            println!(
                "imported {}, skipped {}",
                report.imported.len(),
                report.skipped.len()
            );
        }
        Output::Deleted { name } => println!("deleted '{name}'"),
        Output::Presets(presets) if presets.is_empty() => {
            println!("No presets saved. Add one with: rollin save <name> <formula>");
        }
        Output::Presets(presets) => {
            let width = presets.iter().map(|(n, _)| n.chars().count()).max();
            for (name, formula) in presets {
                println!("{name:<w$}  {formula}", w = width.unwrap_or(0));
            }
        }
    }
}

fn show_rolls(args: &Args, preset: Option<(String, String)>, rolls: Vec<Roll>) {
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
        if let Some((name, formula)) = preset {
            println!("(preset '{name}': {formula})");
        }
        if args.verbose {
            let blocks: Vec<String> = rolls.iter().map(|r| render_verbose(paint, r)).collect();
            println!("{}", blocks.join("\n\n"));
        } else {
            for r in &rolls {
                let prefix = r.iteration.map_or(String::new(), |k| format!("{k}: "));
                println!("{prefix}{}", render_line(paint, r));
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
