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

impl Crit {
    /// The crit of a d20 attack: a natural 1 is a miss, a kept d20 at or above
    /// `range` is a hit, and anything else (or a roll with no d20 check) is
    /// neither.
    pub(crate) fn of(roll: &crate::Roll, range: CritRange) -> Option<Crit> {
        if roll.natural() == Some(Natural::One) {
            return Some(Crit::Miss);
        }
        match roll.check {
            Some(face) if face >= i64::from(range.get()) => Some(Crit::Hit),
            _ => None,
        }
    }
}

/// The lowest kept d20 that is a critical hit: `19` means 19-20. Defaults to
/// 20. A natural 20 always meets it, so only the natural 1 stays a miss.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CritRange(u8);

impl CritRange {
    /// Valid thresholds are 2 to 20: a 1 is always the critical miss.
    pub const MIN: u8 = 2;
    pub const MAX: u8 = 20;

    pub fn new(threshold: i64) -> Option<CritRange> {
        let t = u8::try_from(threshold).ok()?;
        (Self::MIN..=Self::MAX).contains(&t).then_some(CritRange(t))
    }

    pub fn get(self) -> u8 {
        self.0
    }
}

impl Default for CritRange {
    fn default() -> CritRange {
        CritRange(Self::MAX)
    }
}

/// The `crit_range` value of a TOML table at `path`, if it has one.
pub(crate) fn read_crit_range(
    table: &toml::Table,
    path: &std::path::Path,
) -> Result<Option<CritRange>, crate::StoreError> {
    let bad = || {
        crate::StoreError::at(
            path,
            format!(
                "`crit_range` must be an integer from {} to {}",
                CritRange::MIN,
                CritRange::MAX
            ),
        )
    };
    match table.get("crit_range") {
        None => Ok(None),
        Some(toml::Value::Integer(n)) => CritRange::new(*n).map(Some).ok_or_else(bad),
        Some(_) => Err(bad()),
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
