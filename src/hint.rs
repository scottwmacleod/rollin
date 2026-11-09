//! Follow-up suggestions for errors and outputs, as data. A hint carries the
//! facts (a name, a flag) and no wording: the command line words each one as
//! a `rollin ...` command, and the desktop app shows it as a button
//! (ADR 0007). Each variant sits next to the error or output it describes.

use serde::Serialize;

/// A suggested next step.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Hint {
    /// A saved preset or character name close to the one typed.
    DidYouMean { name: String },
    /// A defined variable close to the undefined one typed.
    DidYouMeanVariable { name: String },
    /// List the saved presets.
    ListPresets,
    /// Create the character that does not exist.
    CreateCharacter { name: String },
    /// Define the missing variable. `explicit` is true when the character
    /// was chosen with `--char` rather than being the active one.
    SetVariable {
        character: String,
        name: String,
        explicit: bool,
    },
    /// The name is a global preset: delete it as one.
    DeleteGlobalPreset { name: String },
    /// Command-line help is the `--help` flag, not a session command.
    UseHelpFlag,
    /// The variables the character has; empty when it has none.
    DefinedVariables { names: Vec<String> },
    /// `x` means repeat; `*` multiplies. `suggestion` is the formula
    /// rewritten with `*`, when that is unambiguous.
    UseMultiplication { suggestion: Option<String> },
    /// There are no presets yet: save one.
    AddPreset,
    /// There are no variables yet: set one.
    AddVariable,
}
