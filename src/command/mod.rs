//! The shared command layer: one parser from a list of words to a [`Command`],
//! and one executor that runs it against a [`Context`]. The one-shot binary
//! and the later interactive session both use it. It never prints.

mod context;
mod error;
mod exec;
mod import;
mod output;
mod parse;

pub use context::Context;
pub use error::{CommandError, ErrorReport};
pub use exec::{check, execute};
pub use output::{ImportReport, Output, OutputReport, PresetEntry, PresetSource, Shadow};
pub use parse::parse_command;

use crate::name::Name;
use crate::Error;
use std::path::PathBuf;

/// What the user asked for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    /// Roll a formula.
    Roll(String),
    /// Roll a saved preset (by its lowercase name).
    RollPreset(String),
    /// Save a preset on the active character, or a global one.
    Save {
        name: String,
        formula: String,
        global: bool,
    },
    /// List global presets.
    Presets,
    /// Merge a v1 `presets.json` into the store.
    Import { path: PathBuf, force: bool },
    /// Delete a preset from the active character, or a global one.
    Delete { name: String, global: bool },
    /// Set a variable on a character.
    Set { name: String, value: i64 },
    /// Remove a variable.
    Unset { name: String },
    /// List all characters.
    Characters,
    /// Show the active character.
    CharShow,
    /// Make an existing character active.
    CharSwitch(Name),
    /// Delete a character.
    CharDelete(Name),
    /// Create an empty character and make it active.
    CharNew(String),
    /// List the active character's variables.
    Vars,
}

/// Details of an undefined variable, for a helpful message.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct UndefinedVariable {
    /// The formula text.
    pub source: String,
    /// The underlying [`Error::UndefinedVariable`].
    pub error: Error,
    /// The variable's name, lowercase.
    pub name: String,
    pub character: String,
    /// The character's variable names, sorted.
    pub defined: Vec<String>,
    /// A defined name within edit distance 2 of the missing one.
    pub suggestion: Option<String>,
    /// Whether the character was chosen with `--char`.
    pub explicit: bool,
}

/// Levenshtein distance between two strings.
fn edit_distance(a: &str, b: &str) -> usize {
    let b: Vec<char> = b.chars().collect();
    let mut row: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.chars().enumerate() {
        let mut diag = row[0];
        row[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let up = row[j + 1];
            row[j + 1] = (diag + usize::from(ca != *cb)).min(up + 1).min(row[j] + 1);
            diag = up;
        }
    }
    row[b.len()]
}
