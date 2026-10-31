use super::UndefinedVariable;
use crate::name::NameError;
use crate::presets::StoreError;
use crate::Error;
use std::path::PathBuf;

/// Why a command could not be parsed or run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommandError {
    /// Wrong arguments for a command; the text is the usage line.
    Usage(String),
    /// A formula that does not parse or evaluate; `source` is its text.
    Formula { source: String, error: Error },
    /// A formula used `@name` and the character has no such variable.
    UndefinedVariable(Box<UndefinedVariable>),
    /// `delete` named a preset that does not exist.
    NoSuchPreset(String),
    /// `delete` named a preset the character does not have.
    NoSuchCharacterPreset {
        name: String,
        character: String,
        /// Whether a global preset of that name exists.
        global_exists: bool,
    },
    /// A lone word that is neither a formula nor a saved preset.
    UnknownPreset {
        word: String,
        /// A saved name within edit distance 2 of `word`.
        suggestion: Option<String>,
    },
    /// A lone session-only word (`quit`, `help`, ...) given one-shot.
    SessionOnly { word: String },
    /// Neither `XDG_CONFIG_HOME` nor `HOME` gives a config directory.
    NoConfigDir,
    /// The file given to `import` could not be read as a v1 presets file.
    Import { path: PathBuf, message: String },
    /// No character has this name.
    NoSuchCharacter {
        name: String,
        /// An existing name within edit distance 2.
        suggestion: Option<String>,
    },
    /// `unset` named a variable the character does not have.
    NoSuchVariable { name: String, character: String },
    /// The persisted active character has no file (and is not `default`).
    ActiveCharacterMissing(String),
    /// `char delete default`.
    CannotDeleteDefault,
    /// `char new` named a character that already exists.
    CharacterExists(String),
    /// A character name that breaks a naming rule.
    InvalidCharName(NameError),
    /// A preset name that breaks a naming rule.
    InvalidName(NameError),
    /// A variable name that is not `[a-z][a-z0-9_]*`; the text is as typed.
    InvalidVarName(String),
    /// `set` was given a value that is not an `i64`.
    NotAnInteger(String),
    /// The presets file could not be read or written.
    Store(StoreError),
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandError::Usage(usage) => write!(f, "usage: {usage}"),
            CommandError::Formula { error, .. } => write!(f, "{error}"),
            CommandError::UndefinedVariable(u) => {
                write!(f, "{} on character '{}'", u.error, u.character)
            }
            CommandError::NoSuchPreset(name) => write!(f, "no preset named '{name}'"),
            CommandError::NoSuchCharacterPreset {
                name, character, ..
            } => write!(f, "no preset named '{name}' on character '{character}'"),
            CommandError::UnknownPreset { word, .. } => {
                write!(f, "'{word}' is not a valid formula or a known preset")
            }
            CommandError::SessionOnly { word } => write!(
                f,
                "'{word}' is a session command; run `rollin` with no arguments to start a session and type it there"
            ),
            CommandError::NoConfigDir => {
                write!(
                    f,
                    "cannot find a config directory: set XDG_CONFIG_HOME or HOME"
                )
            }
            CommandError::Import { path, message } => {
                write!(f, "{}: {message}", path.display())
            }
            CommandError::InvalidName(e) => write!(f, "{e}"),
            CommandError::NoSuchCharacter { name, .. } => {
                write!(f, "no character named '{name}'")
            }
            CommandError::NoSuchVariable { name, character } => {
                write!(f, "no variable named '{name}' on character '{character}'")
            }
            CommandError::ActiveCharacterMissing(name) => write!(
                f,
                "the active character '{name}' does not exist; run `rollin char default` to switch back"
            ),
            CommandError::CannotDeleteDefault => {
                write!(f, "the 'default' character cannot be deleted")
            }
            CommandError::CharacterExists(name) => {
                write!(f, "character '{name}' already exists")
            }
            CommandError::InvalidCharName(e) => {
                write!(f, "invalid character name '{}': {}", e.name, e.reason())
            }
            CommandError::InvalidVarName(name) => write!(
                f,
                "invalid variable name '{name}': names must start with a letter and use only letters, digits or '_'"
            ),
            CommandError::NotAnInteger(value) => write!(
                f,
                "'{value}' is not an integer; variables hold whole numbers from {} to {}",
                i64::MIN,
                i64::MAX
            ),
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
