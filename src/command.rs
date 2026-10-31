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
    /// Roll a saved preset (by its lowercase name).
    RollPreset(String),
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

/// Parses a line of words into a command. `preset_names` lists the saved
/// preset names; it is only called when a lone word might be a preset name.
pub fn parse_command(
    words: &[String],
    preset_names: &mut dyn FnMut() -> Result<Vec<String>, StoreError>,
) -> Result<Command, CommandError> {
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
        Some("roll") if rest.is_empty() => {
            Err(CommandError::Usage("roll <formula or preset name>".into()))
        }
        Some("roll") => roll_or_preset(rest, preset_names),
        Some("presets") => Ok(Command::Presets),
        _ => roll_or_preset(words, preset_names),
    }
}

/// A lone word that is not a formula but names a saved preset rolls that
/// preset; anything else is a formula.
fn roll_or_preset(
    words: &[String],
    preset_names: &mut dyn FnMut() -> Result<Vec<String>, StoreError>,
) -> Result<Command, CommandError> {
    if let [word] = words {
        let name = word.to_lowercase();
        if crate::parser::parse(word).is_err() && preset_names()?.contains(&name) {
            return Ok(Command::RollPreset(name));
        }
    }
    Ok(Command::Roll(words.join(" ")))
}

/// Where commands run: the config directory holding the presets file.
pub struct Context {
    pub config_dir: PathBuf,
}

/// What a command produced, for the caller to render.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Output {
    Rolls {
        /// The preset (name, formula) these rolls came from, if any.
        preset: Option<(String, String)>,
        rolls: Vec<Roll>,
    },
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
        Command::Roll(formula) => roll_formula(formula, None, rng),
        Command::RollPreset(name) => {
            let formula = store.load()?.remove(name).unwrap_or_default();
            roll_formula(&formula, Some((name.clone(), formula.clone())), rng)
        }
        Command::Save { name, formula } => {
            check_formula(formula)?;
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

/// Whether `formula` parses (without rolling it).
fn check_formula(formula: &str) -> Result<(), CommandError> {
    crate::parser::parse(formula)
        .map(|_| ())
        .map_err(|error| CommandError::Formula {
            source: formula.to_string(),
            error,
        })
}

fn roll_formula(
    formula: &str,
    preset: Option<(String, String)>,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    crate::roll(formula, rng)
        .map(|rolls| Output::Rolls { preset, rolls })
        .map_err(|error| CommandError::Formula {
            source: formula.to_string(),
            error,
        })
}
