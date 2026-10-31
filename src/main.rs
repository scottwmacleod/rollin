mod render;

use clap::Parser;
use rand_chacha::ChaCha8Rng;
use render::{color_enabled, render_line, render_verbose, ColorChoice, Painter};
use rollin::{
    entropy_rng, execute, parse_command, seeded_rng, session_command, CommandError, Context, Error,
    Output, PresetEntry, PresetSource, Roll, SessionCommand, Shadow,
};
use serde::Serialize;
use std::io::{BufRead, IsTerminal};
use std::path::PathBuf;
use std::process::ExitCode;

/// A dice roller for the command line.
#[derive(Parser)]
#[command(version)]
struct Args {
    /// A formula to roll, e.g. d20 or "4d6dl1, d20+5", a preset name, or a
    /// command: save, presets, delete, import, roll, set, unset, vars, char, characters
    #[arg(allow_negative_numbers = true)]
    words: Vec<String>,

    /// Seed the random number generator for reproducible rolls
    #[arg(long)]
    seed: Option<u64>,

    /// Use this character for this one call (never persisted)
    #[arg(long = "char", value_name = "NAME")]
    character: Option<String>,

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

    /// Save to the global presets instead of the active character (only for
    /// `save`; handled by the command parser, which clap would otherwise
    /// reject as an unknown flag)
    #[arg(long, hide = true)]
    global: bool,

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
    let mut rng = entropy_rng();
    if args.words.is_empty() {
        return session(&mut rng);
    }
    run_line(&args, &mut rng)
}

/// Reads lines from stdin and runs each as if its words were given one-shot.
fn session(rng: &mut ChaCha8Rng) -> ExitCode {
    for line in std::io::stdin().lock().lines().map_while(Result::ok) {
        let words: Vec<&str> = line.split_whitespace().collect();
        if session_command(&words) == Some(SessionCommand::Quit) {
            break;
        }
        match Args::try_parse_from(std::iter::once("rollin").chain(words)) {
            Ok(args) if args.words.is_empty() => {}
            Ok(args) => {
                run_line(&args, rng);
            }
            // Print the clap error (or --help text) and carry on.
            Err(e) => {
                let _ = e.print();
            }
        }
    }
    ExitCode::SUCCESS
}

/// Runs one parsed command line against a fresh context, printing its
/// output or error. The one-shot path and the session both come through here.
fn run_line(args: &Args, rng: &mut ChaCha8Rng) -> ExitCode {
    let mut ctx = Context::new(config_dir());
    ctx.character = args.character.clone();
    let names = &mut || ctx.preset_names();
    let mut words = args.words.clone();
    if args.global {
        words.push("--global".into());
    }
    if args.force {
        words.push("--force".into());
    }
    let command = match parse_command(&words, names) {
        Ok(command) => command,
        Err(e) => return fail(&e),
    };
    if let Some(seed) = args.seed {
        *rng = seeded_rng(seed);
    }
    match execute(&command, &ctx, rng) {
        Ok(output) => {
            show(args, output);
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
        CommandError::Formula { source, error } => {
            eprint!("{}", render_error(source, error, &error.to_string()));
        }
        CommandError::UndefinedVariable(u) => {
            eprint!("{}", render_error(&u.source, &u.error, &e.to_string()));
            if u.defined.is_empty() {
                eprintln!("no variables are defined");
            } else {
                eprintln!("defined: {}", u.defined.join(", "));
            }
            if let Some(near) = &u.suggestion {
                eprintln!("did you mean @{near}?");
            }
            let char_flag = if u.explicit {
                format!("--char {} ", u.character)
            } else {
                String::new()
            };
            eprintln!("set it with: rollin {char_flag}set {} <value>", u.name);
        }
        CommandError::UnknownPreset { suggestion, .. } => {
            eprintln!("error: {e}");
            if let Some(name) = suggestion {
                eprintln!("hint: did you mean '{name}'?");
            }
            eprintln!("hint: run `rollin presets` to list saved presets");
        }
        CommandError::NoSuchCharacterPreset {
            name,
            global_exists: true,
            ..
        } => {
            eprintln!("error: {e}");
            eprintln!("hint: it is a global preset; delete it with: rollin delete --global {name}");
        }
        CommandError::NoSuchCharacter { name, suggestion } => {
            eprintln!("error: {e}");
            if let Some(near) = suggestion {
                eprintln!("hint: did you mean '{near}'?");
            }
            eprintln!("hint: create it with: rollin char new {name}");
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
            character,
            replaced: None,
        } => println!("saved '{name}'{}: {formula}", on(&character)),
        Output::Saved {
            name,
            formula,
            character,
            replaced: Some(old),
        } => println!("replaced '{name}'{} (was {old}): {formula}", on(&character)),
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
        Output::VarUnset { name, character } => println!("unset {name} on '{character}'"),
        Output::Characters { names, active } => {
            for name in &names {
                let mark = if *name == active { '*' } else { ' ' };
                println!("{mark} {name}");
            }
            if !names.contains(&active) {
                println!("* {active} (missing)");
            }
        }
        Output::CharDeleted {
            name,
            was_active: false,
        } => println!("deleted character '{name}'"),
        Output::CharDeleted { name, .. } => {
            println!("deleted character '{name}'; active character is now 'default'");
        }
        Output::CharCreated(name) => {
            println!("created character '{name}' and made it active");
        }
        Output::CharSwitched(name) => println!("active character: {name}"),
        Output::ActiveCharacter(name) => println!("active character: {name}"),
        Output::Vars(vars) if vars.is_empty() => {
            println!("No variables set. Add one with: rollin set <name> <integer>");
        }
        Output::Vars(vars) => {
            for (name, value) in vars {
                println!("{name} = {value}");
            }
        }
        Output::VarSet {
            name,
            value,
            character,
        } => println!("set {name} = {value} on '{character}'"),
        Output::Deleted {
            name,
            character: None,
        } => println!("deleted '{name}'"),
        Output::Deleted {
            name,
            character: Some(character),
        } => println!("deleted '{name}' from '{character}'"),
        Output::Presets(presets) if presets.is_empty() => {
            println!("No presets saved. Add one with: rollin save <name> <formula>");
        }
        Output::Presets(presets) => {
            let width = |f: fn(&PresetEntry) -> usize| presets.iter().map(f).max().unwrap_or(0);
            let (name_w, formula_w) = (
                width(|p| p.name.chars().count()),
                width(|p| p.formula.chars().count()),
            );
            for p in &presets {
                let source = match &p.source {
                    PresetSource::Character(c) => c.as_str(),
                    PresetSource::Global => "global",
                };
                let note = match &p.shadow {
                    Shadow::None => String::new(),
                    Shadow::Shadows => ", shadows global".to_string(),
                    Shadow::ShadowedBy(c) => format!(", shadowed by {c}"),
                };
                println!(
                    "{:<name_w$}  {:<formula_w$}  [{source}{note}]",
                    p.name, p.formula
                );
            }
        }
    }
}

/// ` on 'grog'` for a character preset, nothing for a global one.
fn on(character: &Option<String>) -> String {
    character
        .as_ref()
        .map_or(String::new(), |c| format!(" on '{c}'"))
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
            let total = rolls.iter().filter_map(|r| r.iteration).max().unwrap_or(0);
            let mut previous = None;
            let blocks: Vec<String> = rolls
                .iter()
                .map(|r| {
                    let block = render_verbose(paint, r);
                    let header = match r.iteration {
                        Some(k) if previous != Some(k) => {
                            format!("iteration {k} of {total}\n")
                        }
                        _ => String::new(),
                    };
                    previous = r.iteration;
                    format!("{header}{block}")
                })
                .collect();
            println!("{}", blocks.join("\n\n"));
        } else {
            let width = iteration_width(&rolls);
            for r in &rolls {
                let prefix = r
                    .iteration
                    .map_or(String::new(), |k| format!("{k:>width$}: "));
                println!("{prefix}{}", render_line(paint, r));
            }
        }
    }
}

/// Digits in the highest iteration number, so prefixes line up.
fn iteration_width(rolls: &[Roll]) -> usize {
    let last = rolls.iter().filter_map(|r| r.iteration).max().unwrap_or(0);
    last.to_string().len()
}

/// The message, the formula, and carets under the offending span.
fn render_error(formula: &str, error: &Error, message: &str) -> String {
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
        "error: {message}\n  {line}\n  {}{}\n",
        " ".repeat(start),
        "^".repeat(len)
    )
}
