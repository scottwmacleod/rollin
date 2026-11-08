//! One typed line, run: the session words (`help`, `history`, `quit`), the
//! per-line flags, the acting character and execution. The terminal session
//! and the desktop app both call [`run_line`]; each supplies a
//! [`LinePolicy`] for the flags it accepts and shows the [`LineOutcome`] its
//! own way.

use crate::{
    execute, format_history, help_text, parse_command, seeded_rng, session_command, CommandError,
    Context, Output, SessionCommand,
};
use rand_chacha::ChaCha8Rng;
use std::path::PathBuf;

/// Which front end typed the line, and so which per-line flags it accepts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LinePolicy(Kind);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Repl,
    Desktop,
}

impl LinePolicy {
    /// The terminal session: every command-line flag works on a line.
    pub const REPL: LinePolicy = LinePolicy(Kind::Repl);
    /// The desktop app: `--char` only. The seed is a session control there
    /// (ADR-0007), and output modes are the log's business.
    pub const DESKTOP: LinePolicy = LinePolicy(Kind::Desktop);

    fn repl(self) -> bool {
        self.0 == Kind::Repl
    }

    /// The long flags this front end accepts (and completion offers).
    pub fn flags(self) -> Vec<&'static str> {
        let mut flags = vec!["--char", "--force", "--global"];
        if self.repl() {
            flags.extend(["--color", "--json", "--quiet", "--seed"]);
        }
        flags.sort_unstable();
        flags
    }
}

/// When to colour output, from `--color`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorWhen {
    Auto,
    Always,
    Never,
}

/// The per-line flags that only change how a front end shows output.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LineFlags {
    pub json: bool,
    pub quiet: bool,
    pub color: Option<ColorWhen>,
}

/// What a typed line came to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LineOutcome {
    /// A blank line, or only flags.
    Empty,
    /// `quit` / `exit`: the front end decides what that means.
    Quit,
    /// Text from a session word (`help`, `history`).
    Text(String),
    /// A command ran.
    Output { output: Output, flags: LineFlags },
    /// A command failed.
    Error(CommandError),
    /// The flags on the line are not ones this front end accepts.
    Rejected(String),
}

/// Runs one line against `config_dir`. A per-line `--seed` (where the policy
/// allows it) reseeds `rng` once the line has parsed. `history` is only
/// called for the `history` word.
pub fn run_line(
    line: &str,
    policy: LinePolicy,
    config_dir: Option<PathBuf>,
    rng: &mut ChaCha8Rng,
    history: &dyn Fn() -> Vec<String>,
) -> LineOutcome {
    let words: Vec<&str> = line.split_whitespace().collect();
    match session_command(&words) {
        Some(SessionCommand::Quit) => return LineOutcome::Quit,
        Some(SessionCommand::Help) => return LineOutcome::Text(help_text(policy)),
        Some(SessionCommand::History) => {
            let entries = history();
            return LineOutcome::Text(format_history(entries.iter().map(String::as_str)));
        }
        None => {}
    }
    let parsed = match take_flags(&words, policy) {
        Ok(parsed) => parsed,
        Err(message) => return LineOutcome::Rejected(message),
    };
    if parsed.help {
        return LineOutcome::Text(help_text(policy));
    }
    if parsed.words.is_empty() {
        return LineOutcome::Empty;
    }
    let mut ctx = Context::new(config_dir);
    ctx.character = parsed.character;
    let command = match parse_command(&parsed.words, &mut || ctx.preset_names()) {
        Ok(command) => command,
        Err(e) => return LineOutcome::Error(e),
    };
    if let Some(seed) = parsed.seed {
        *rng = seeded_rng(seed);
    }
    match execute(&command, &ctx, rng) {
        Ok(output) => LineOutcome::Output {
            output,
            flags: parsed.flags,
        },
        Err(e) => LineOutcome::Error(e),
    }
}

#[derive(Default)]
struct Parsed {
    words: Vec<String>,
    character: Option<String>,
    seed: Option<u64>,
    flags: LineFlags,
    help: bool,
}

/// Splits the per-line flags out of a line. `--global` and `--force` stay in
/// the words: they belong to the command parser.
fn take_flags(words: &[&str], policy: LinePolicy) -> Result<Parsed, String> {
    let mut out = Parsed::default();
    let mut iter = words.iter();
    while let Some(&word) = iter.next() {
        let lower = word.to_lowercase();
        let (flag, inline) = match lower.split_once('=') {
            Some((flag, _)) if flag.starts_with("--") => (flag, Some(&word[flag.len() + 1..])),
            _ => (lower.as_str(), None),
        };
        let mut value = |what: &str| {
            inline
                .map(str::to_string)
                .or_else(|| iter.next().map(|w| w.to_string()))
                .ok_or_else(|| format!("{flag} needs {what}"))
        };
        match flag {
            "--char" => out.character = Some(value("a character name")?),
            "--seed" | "--json" | "--quiet" | "-q" | "--color" if !policy.repl() => {
                return Err(if flag == "--seed" {
                    "--seed is not a per-line flag here; use the seed control".to_string()
                } else {
                    format!("{flag} is not a per-line flag here")
                });
            }
            "--seed" => {
                let text = value("a number")?;
                out.seed = Some(text.parse().map_err(|_| {
                    format!("invalid --seed value '{text}': expected a whole number")
                })?);
            }
            "--json" => out.flags.json = true,
            "--quiet" | "-q" => out.flags.quiet = true,
            "--color" => {
                let text = value("auto, always or never")?;
                out.flags.color = Some(match text.to_lowercase().as_str() {
                    "auto" => ColorWhen::Auto,
                    "always" => ColorWhen::Always,
                    "never" => ColorWhen::Never,
                    _ => {
                        return Err(format!(
                            "invalid --color value '{text}': choose auto, always or never"
                        ))
                    }
                });
            }
            "--help" | "-h" if policy.repl() => out.help = true,
            _ if policy.repl() && looks_like_flag(word) => {
                return Err(format!("unexpected argument '{word}'"));
            }
            _ => out.words.push(word.to_string()),
        }
    }
    Ok(out)
}

/// A word the terminal session refuses rather than parse as a formula:
/// `--name` or `-x`. Negative numbers are words.
fn looks_like_flag(word: &str) -> bool {
    let rest = word.strip_prefix("--").map_or_else(
        || {
            word.strip_prefix('-')
                .filter(|r| r.starts_with(|c: char| c.is_ascii_alphabetic()))
        },
        |r| Some(r).filter(|r| !r.is_empty()),
    );
    rest.is_some() && !matches!(word.to_lowercase().as_str(), "--global" | "--force")
}
