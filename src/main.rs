mod render;
mod repl;

use clap::Parser;
use rand_chacha::ChaCha8Rng;
use render::{color_enabled, render_line, ColorChoice, Painter};
use rollin::{
    entropy_rng, execute, parse_command, seeded_rng, CommandError, Context, Error, Hint, Output,
    PresetEntry, PresetSource, Roll, Shadow,
};
use serde::Serialize;
use std::io::IsTerminal;
use std::path::PathBuf;
use std::process::ExitCode;

const EXAMPLES: &str = "\
Examples:
  $ rollin d20+5                        roll a d20 and add 5
  $ rollin 4d6dl1                       roll 4d6, drop the lowest
  $ rollin 'd20+8, d10+5'               a comma list: one roll per item
  $ rollin '3d6!'                       exploding dice
  $ rollin 4d6r1                        reroll 1s once
  $ rollin 6d10>=8f1                    count successes, 1s are failures
  $ rollin d20adv+8                     advantage with a modifier
  $ rollin 6x 4d6dl1                    repeat: a full stat block
  $ rollin 'd20+8 # attack'             label a roll (quote the #)
  $ rollin 2d6+3 --seed 7               reproducible
  $ rollin 2d6+3 --json                 machine-readable
  $ rollin -q 2d6+3                     only the total
  $ rollin set str 3                    set a variable on the active character
  $ rollin 'd20+@str'                   use it in a formula
  $ rollin save atk 'd20+@str'          save a preset (roll it with: rollin atk)
  $ rollin char new grog                create a character and switch to it
  $ rollin                              no formula: start an interactive session

Run `rollin` with no arguments for a session, and see the README for the full
formula syntax.";

/// A dice roller for the command line.
#[derive(Parser)]
#[command(version, after_help = EXAMPLES)]
pub struct Args {
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

    /// Print the result tree as JSON (ignores -q)
    #[arg(long)]
    json: bool,

    /// Print only the total of each roll, one per line
    #[arg(short, long)]
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
        // Other flags given at startup have nothing to apply to; only the
        // seed means something to a whole session.
        if let Some(seed) = args.seed {
            rng = seeded_rng(seed);
        }
        return repl::session(&mut rng);
    }
    run_line(&args, &mut rng)
}

/// Runs one parsed command line against a fresh context, printing its
/// output or error. The one-shot path and the session both come through here.
pub fn run_line(args: &Args, rng: &mut ChaCha8Rng) -> ExitCode {
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
pub fn config_dir() -> Option<PathBuf> {
    let xdg = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from);
    let home = std::env::var_os("HOME").map(PathBuf::from);
    rollin::config_dir(xdg.as_deref(), home.as_deref())
}

fn fail(e: &CommandError) -> ExitCode {
    match e {
        CommandError::Formula { source, error } => {
            eprint!("{}", render_error(source, error, &e.message()));
        }
        CommandError::UndefinedVariable(u) => {
            eprint!("{}", render_error(&u.source, &u.error, &e.message()));
        }
        other => eprintln!("error: {}", other.message()),
    }
    for hint in e.hints() {
        eprintln!("{}", hint_line(&hint));
    }
    ExitCode::FAILURE
}

/// The command-line wording of a hint, as one line.
fn hint_line(hint: &Hint) -> String {
    match hint {
        Hint::DidYouMean { name } => format!("hint: did you mean '{name}'?"),
        Hint::DidYouMeanVariable { name } => format!("did you mean @{name}?"),
        Hint::ListPresets => "hint: run `rollin presets` to list saved presets".into(),
        Hint::CreateCharacter { name } => format!("hint: create it with: rollin char new {name}"),
        Hint::SetVariable {
            character,
            name,
            explicit,
        } => {
            let char_flag = if *explicit {
                format!("--char {character} ")
            } else {
                String::new()
            };
            format!("set it with: rollin {char_flag}set {name} <value>")
        }
        Hint::DeleteGlobalPreset { name } => {
            format!("hint: it is a global preset; delete it with: rollin delete --global {name}")
        }
        Hint::UseHelpFlag => "hint: for command-line help, run `rollin --help`".into(),
        Hint::DefinedVariables { names } if names.is_empty() => "no variables are defined".into(),
        Hint::DefinedVariables { names } => format!("defined: {}", names.join(", ")),
        Hint::UseMultiplication {
            suggestion: Some(m),
        } => format!("hint: for multiplication use *; did you mean {m}?"),
        Hint::UseMultiplication { suggestion: None } => "hint: for multiplication use *".into(),
        Hint::AddPreset => "Add one with: rollin save <name> <formula>".into(),
        Hint::AddVariable => "Add one with: rollin set <name> <integer>".into(),
    }
}

fn show(args: &Args, output: Output) {
    match output {
        Output::Rolls { preset, rolls } => show_rolls(args, preset, rolls),
        Output::Characters { names, active } => {
            for name in &names {
                let mark = if *name == active { '*' } else { ' ' };
                println!("{mark} {name}");
            }
            if !names.contains(&active) {
                println!("* {active} (missing)");
            }
        }
        Output::Vars { vars } if !vars.is_empty() => {
            for (name, value) in vars {
                println!("{name} = {value}");
            }
        }
        Output::Presets { presets } if !presets.is_empty() => {
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
        other => {
            // Single-line outputs carry neutral text; an empty list's hint
            // continues its last line.
            let mut lines = other.lines();
            if let (Some(last), Some(hint)) = (lines.last_mut(), other.hints().first()) {
                *last = format!("{last} {}", hint_line(hint));
            }
            for line in lines {
                println!("{line}");
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
        let width = iteration_width(&rolls);
        for r in &rolls {
            let prefix = r
                .iteration
                .map_or(String::new(), |k| format!("{k:>width$}: "));
            println!("{prefix}{}", render_line(paint, r));
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
