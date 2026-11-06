use super::UndefinedVariable;
use crate::name::NameError;
use crate::presets::StoreError;
use crate::{Error, Hint};
use serde::Serialize;
use std::path::PathBuf;

/// Why a command could not be parsed or run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CommandError {
    /// Wrong arguments for a command; the text is the usage line.
    Usage { usage: String },
    /// A formula that does not parse or evaluate; `source` is its text.
    Formula { source: String, error: Error },
    /// A formula used `@name` and the character has no such variable.
    UndefinedVariable(Box<UndefinedVariable>),
    /// `delete` named a preset that does not exist.
    NoSuchPreset { name: String },
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
    ActiveCharacterMissing { name: String },
    /// `char delete default`.
    CannotDeleteDefault,
    /// `char rename default ...`.
    CannotRenameDefault,
    /// A character name that already exists (`char new`, `char rename`).
    CharacterExists { name: String },
    /// A character name that breaks a naming rule.
    InvalidCharName(NameError),
    /// A preset name that breaks a naming rule.
    InvalidName(NameError),
    /// A variable name that is not `[a-z][a-z0-9_]*`; the text is as typed.
    InvalidVarName { name: String },
    /// `set` was given a value that is not an `i64`.
    NotAnInteger { value: String },
    /// The presets file could not be read or written.
    Store(StoreError),
}

/// A [`CommandError`] with its neutral message and hints alongside, for
/// callers that send errors over a wire (the desktop app). The error's
/// fields and `kind` tag stay at the top level; `message` and `hints` are
/// added.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ErrorReport<'a> {
    #[serde(flatten)]
    pub error: &'a CommandError,
    /// [`CommandError::message`].
    pub message: String,
    /// [`CommandError::hints`].
    pub hints: Vec<Hint>,
}

impl CommandError {
    /// This error with its message and hints, ready to serialise.
    pub fn report(&self) -> ErrorReport<'_> {
        ErrorReport {
            error: self,
            message: self.message(),
            hints: self.hints(),
        }
    }

    /// A neutral one-line description of what went wrong. For formula
    /// errors the caller points at the span; see [`Error::span`].
    pub fn message(&self) -> String {
        self.to_string()
    }

    /// Suggestions for fixing the error, as data. The caller words them.
    pub fn hints(&self) -> Vec<Hint> {
        let did_you_mean = |name: &Option<String>| {
            name.iter()
                .map(|name| Hint::DidYouMean { name: name.clone() })
                .collect::<Vec<_>>()
        };
        match self {
            CommandError::Formula { error, .. } => error.hints(),
            CommandError::UndefinedVariable(u) => {
                let mut hints = vec![Hint::DefinedVariables {
                    names: u.defined.clone(),
                }];
                if let Some(name) = &u.suggestion {
                    hints.push(Hint::DidYouMeanVariable { name: name.clone() });
                }
                hints.push(Hint::SetVariable {
                    character: u.character.clone(),
                    name: u.name.clone(),
                    explicit: u.explicit,
                });
                hints
            }
            CommandError::UnknownPreset { suggestion, .. } => {
                let mut hints = did_you_mean(suggestion);
                hints.push(Hint::ListPresets);
                hints
            }
            CommandError::SessionOnly { word } if word.eq_ignore_ascii_case("help") => {
                vec![Hint::UseHelpFlag]
            }
            CommandError::NoSuchCharacterPreset {
                name,
                global_exists: true,
                ..
            } => vec![Hint::DeleteGlobalPreset { name: name.clone() }],
            CommandError::NoSuchCharacter { name, suggestion } => {
                let mut hints = did_you_mean(suggestion);
                hints.push(Hint::CreateCharacter { name: name.clone() });
                hints
            }
            _ => vec![],
        }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandError::Usage { usage } => write!(f, "usage: {usage}"),
            CommandError::Formula { error, .. } => write!(f, "{error}"),
            CommandError::UndefinedVariable(u) => {
                write!(f, "{} on character '{}'", u.error, u.character)
            }
            CommandError::NoSuchPreset { name } => write!(f, "no preset named '{name}'"),
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
            CommandError::ActiveCharacterMissing { name } => write!(
                f,
                "the active character '{name}' does not exist; run `rollin char default` to switch back"
            ),
            CommandError::CannotDeleteDefault => {
                write!(f, "the 'default' character cannot be deleted")
            }
            CommandError::CannotRenameDefault => {
                write!(f, "the 'default' character cannot be renamed")
            }
            CommandError::CharacterExists { name } => {
                write!(f, "character '{name}' already exists")
            }
            CommandError::InvalidCharName(e) => {
                write!(f, "invalid character name '{}': {}", e.name, e.reason())
            }
            CommandError::InvalidVarName { name } => write!(
                f,
                "invalid variable name '{name}': names must start with a letter and use only letters, digits or '_'"
            ),
            CommandError::NotAnInteger { value } => write!(
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
