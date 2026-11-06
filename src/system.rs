//! Game systems: rule sets that give rolls meaning beyond their total.

use crate::Natural;
use serde::Serialize;

/// A game system a character (or the global settings) can name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum System {
    /// Dungeons & Dragons 5th edition: a natural 20 on a d20 attack is a
    /// critical hit, which doubles the dice of its damage; a natural 1 is a
    /// critical miss.
    Dnd5e,
}

impl System {
    /// The value written in a TOML file.
    pub fn as_str(self) -> &'static str {
        match self {
            System::Dnd5e => "dnd5e",
        }
    }

    /// The system a TOML value names (case-insensitive).
    pub fn parse(text: &str) -> Option<System> {
        match text.trim().to_ascii_lowercase().as_str() {
            "dnd5e" => Some(System::Dnd5e),
            _ => None,
        }
    }

    /// Every system, for error messages.
    pub const ALL: [System; 1] = [System::Dnd5e];
}

/// How an attack under a game system turned out at the extremes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Crit {
    /// A natural 20.
    Hit,
    /// A natural 1. Flagged only: it changes no dice.
    Miss,
}

impl From<Natural> for Crit {
    fn from(natural: Natural) -> Crit {
        match natural {
            Natural::Twenty => Crit::Hit,
            Natural::One => Crit::Miss,
        }
    }
}

/// The `system` value of a TOML table at `path`, if it has one.
pub(crate) fn read_system(
    table: &toml::Table,
    path: &std::path::Path,
) -> Result<Option<System>, crate::StoreError> {
    match table.get("system") {
        None => Ok(None),
        Some(toml::Value::String(text)) => System::parse(text).map(Some).ok_or_else(|| {
            let known: Vec<String> = System::ALL
                .iter()
                .map(|s| format!("\"{}\"", s.as_str()))
                .collect();
            crate::StoreError::at(
                path,
                format!("`system` must be one of {}", known.join(", ")),
            )
        }),
        Some(_) => Err(crate::StoreError::at(path, "`system` must be a string")),
    }
}
