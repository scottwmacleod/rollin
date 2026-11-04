use crate::{Hint, Roll};
use serde::Serialize;

/// What a command produced, for the caller to render.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Output {
    Rolls {
        /// The preset (name, formula) these rolls came from, if any.
        preset: Option<(String, String)>,
        rolls: Vec<Roll>,
    },
    Saved {
        name: String,
        formula: String,
        /// The character it was saved on; `None` for a global preset.
        character: Option<String>,
        /// The formula this save overwrote, if the name already existed.
        replaced: Option<String>,
    },
    Deleted {
        name: String,
        /// The character it was deleted from; `None` for a global preset.
        character: Option<String>,
    },
    Imported(ImportReport),
    /// A variable was removed from a character.
    VarUnset {
        name: String,
        character: String,
    },
    /// All characters, sorted, and which one is active.
    Characters {
        names: Vec<String>,
        active: String,
    },
    /// The active character.
    ActiveCharacter {
        name: String,
    },
    /// A character was deleted; `was_active` if it had been the active one.
    CharDeleted {
        name: String,
        was_active: bool,
    },
    /// A character was created and made active.
    CharCreated {
        name: String,
    },
    /// A different character was made active.
    CharSwitched {
        name: String,
    },
    /// Variables as (name, value), sorted by name.
    Vars {
        vars: Vec<(String, i64)>,
    },
    VarSet {
        name: String,
        value: i64,
        character: String,
    },
    /// The active character's presets, then the global ones.
    Presets {
        presets: Vec<PresetEntry>,
    },
}

impl Output {
    /// Neutral sentences for the outputs that are a few fixed lines: saves,
    /// deletes, imports, variable and character changes, and the empty
    /// preset and variable lists. Structured outputs (rolls, the preset
    /// table, the character list, variables) return nothing: callers lay
    /// those out themselves. Wording that tells the user what to run next
    /// is not here; see [`Output::hints`].
    pub fn lines(&self) -> Vec<String> {
        let on = |character: &Option<String>| {
            character
                .as_ref()
                .map_or(String::new(), |c| format!(" on '{c}'"))
        };
        match self {
            Output::Rolls { .. } | Output::Characters { .. } => vec![],
            Output::Saved {
                name,
                formula,
                character,
                replaced: None,
            } => vec![format!("saved '{name}'{}: {formula}", on(character))],
            Output::Saved {
                name,
                formula,
                character,
                replaced: Some(old),
            } => vec![format!(
                "replaced '{name}'{} (was {old}): {formula}",
                on(character)
            )],
            Output::Deleted {
                name,
                character: None,
            } => vec![format!("deleted '{name}'")],
            Output::Deleted {
                name,
                character: Some(character),
            } => vec![format!("deleted '{name}' from '{character}'")],
            Output::Imported(report) => {
                let mut lines: Vec<String> = report
                    .skipped
                    .iter()
                    .map(|(name, reason)| format!("skipped '{name}': {reason}"))
                    .collect();
                lines.push(format!(
                    "imported {}, skipped {}",
                    report.imported.len(),
                    report.skipped.len()
                ));
                lines
            }
            Output::VarUnset { name, character } => vec![format!("unset {name} on '{character}'")],
            Output::VarSet {
                name,
                value,
                character,
            } => vec![format!("set {name} = {value} on '{character}'")],
            Output::CharDeleted {
                name,
                was_active: false,
            } => vec![format!("deleted character '{name}'")],
            Output::CharDeleted { name, .. } => {
                vec![format!(
                    "deleted character '{name}'; active character is now 'default'"
                )]
            }
            Output::CharCreated { name } => {
                vec![format!("created character '{name}' and made it active")]
            }
            Output::CharSwitched { name } | Output::ActiveCharacter { name } => {
                vec![format!("active character: {name}")]
            }
            Output::Vars { vars } if vars.is_empty() => vec!["No variables set.".into()],
            Output::Vars { .. } => vec![],
            Output::Presets { presets } if presets.is_empty() => vec!["No presets saved.".into()],
            Output::Presets { .. } => vec![],
        }
    }

    /// This output with its text and hints, ready to serialise.
    pub fn report(&self) -> OutputReport<'_> {
        OutputReport {
            output: self,
            lines: self.lines(),
            hints: self.hints(),
        }
    }

    /// Follow-up suggestions: how to fill an empty list.
    pub fn hints(&self) -> Vec<Hint> {
        match self {
            Output::Vars { vars } if vars.is_empty() => vec![Hint::AddVariable],
            Output::Presets { presets } if presets.is_empty() => vec![Hint::AddPreset],
            _ => vec![],
        }
    }
}

/// An [`Output`] with its neutral text and hints alongside, for callers
/// that send results over a wire (the desktop app). The output's fields
/// and `kind` tag stay at the top level; `lines` and `hints` are added.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OutputReport<'a> {
    #[serde(flatten)]
    pub output: &'a Output,
    /// [`Output::lines`].
    pub lines: Vec<String>,
    /// [`Output::hints`].
    pub hints: Vec<Hint>,
}

/// Where a saved preset lives.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "name", rename_all = "snake_case")]
pub enum PresetSource {
    /// On the named character.
    Character(String),
    Global,
}

/// One line of the `presets` listing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PresetEntry {
    pub name: String,
    pub formula: String,
    pub source: PresetSource,
    pub shadow: Shadow,
}

/// How a preset relates to a same-named one in the other scope.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "by", rename_all = "snake_case")]
pub enum Shadow {
    None,
    /// A character preset hiding a global one.
    Shadows,
    /// A global preset hidden by the named character's preset.
    ShadowedBy(String),
}

/// What an import did.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct ImportReport {
    /// Names added (or replaced, with `--force`).
    pub imported: Vec<String>,
    /// Entries left out, as (name as written, reason).
    pub skipped: Vec<(String, String)>,
}
