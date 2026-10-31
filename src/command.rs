//! The shared command layer: one parser from a list of words to a [`Command`],
//! and one executor that runs it against a [`Context`]. The one-shot binary
//! and the later interactive session both use it. It never prints.

use crate::presets::{Store, StoreError};
use crate::{Error, Roll};
use rand::Rng;
use std::path::PathBuf;

/// What the user asked for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    /// Roll a formula.
    Roll(String),
    /// Save a global preset.
    Save { name: String, formula: String },
    /// List global presets.
    Presets,
}

/// Why a command could not be parsed or run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommandError {
    /// Wrong arguments for a command; the text is the usage line.
    Usage(String),
    /// A formula that does not parse or evaluate; `source` is its text.
    Formula { source: String, error: Error },
    /// The presets file could not be read or written.
    Store(StoreError),
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandError::Usage(usage) => write!(f, "usage: {usage}"),
            CommandError::Formula { error, .. } => write!(f, "{error}"),
            CommandError::Store(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for CommandError {}

impl From<StoreError> for CommandError {
    fn from(e: StoreError) -> Self {
        CommandError::Store(e)
    }
}

/// Parses a line of words into a command.
pub fn parse_command(words: &[String]) -> Result<Command, CommandError> {
    let first = words.first().map(|w| w.to_lowercase());
    let rest = words.get(1..).unwrap_or_default();
    match first.as_deref() {
        Some("save") => match rest {
            [name, formula @ ..] if !formula.is_empty() => Ok(Command::Save {
                name: name.clone(),
                formula: formula.join(" "),
            }),
            _ => Err(CommandError::Usage("save <name> <formula>".into())),
        },
        Some("presets") => Ok(Command::Presets),
        _ => Ok(Command::Roll(words.join(" "))),
    }
}

/// Where commands run: the config directory holding the presets file.
pub struct Context {
    pub config_dir: PathBuf,
}

/// What a command produced, for the caller to render.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Output {
    Rolls(Vec<Roll>),
    Saved {
        name: String,
        formula: String,
    },
    /// Presets as (name, formula), sorted by name.
    Presets(Vec<(String, String)>),
}

/// Runs a command.
pub fn execute(
    command: &Command,
    ctx: &Context,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    let store = Store::in_config_dir(&ctx.config_dir);
    match command {
        Command::Roll(formula) => crate::roll(formula, rng)
            .map(Output::Rolls)
            .map_err(|error| CommandError::Formula {
                source: formula.clone(),
                error,
            }),
        Command::Save { name, formula } => {
            let mut presets = store.load()?;
            presets.insert(name.to_lowercase(), formula.clone());
            store.save(&presets)?;
            Ok(Output::Saved {
                name: name.to_lowercase(),
                formula: formula.clone(),
            })
        }
        Command::Presets => Ok(Output::Presets(store.load()?.into_iter().collect())),
    }
}
