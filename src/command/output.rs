use crate::Roll;

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
    ActiveCharacter(String),
    /// A character was deleted; `was_active` if it had been the active one.
    CharDeleted {
        name: String,
        was_active: bool,
    },
    /// A character was created and made active.
    CharCreated(String),
    /// A different character was made active.
    CharSwitched(String),
    /// Variables as (name, value), sorted by name.
    Vars(Vec<(String, i64)>),
    VarSet {
        name: String,
        value: i64,
        character: String,
    },
    /// The active character's presets, then the global ones.
    Presets(Vec<PresetEntry>),
}

/// Where a saved preset lives.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PresetSource {
    /// On the named character.
    Character(String),
    Global,
}

/// One line of the `presets` listing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PresetEntry {
    pub name: String,
    pub formula: String,
    pub source: PresetSource,
    pub shadow: Shadow,
}

/// How a preset relates to a same-named one in the other scope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Shadow {
    None,
    /// A character preset hiding a global one.
    Shadows,
    /// A global preset hidden by the named character's preset.
    ShadowedBy(String),
}

/// What an import did.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ImportReport {
    /// Names added (or replaced, with `--force`).
    pub imported: Vec<String>,
    /// Entries left out, as (name as written, reason).
    pub skipped: Vec<(String, String)>,
}
