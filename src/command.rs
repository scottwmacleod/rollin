//! The shared command layer: one parser from a list of words to a [`Command`],
//! and one executor that runs it against a [`Context`]. The one-shot binary
//! and the later interactive session both use it. It never prints.

use crate::characters::CharacterStore;
use crate::presets::{is_name_shaped, validate_name, NameError, Store, StoreError};
use crate::{Error, Roll};
use rand::Rng;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

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
    /// Merge a v1 `presets.json` into the store.
    Import { path: PathBuf, force: bool },
    /// Delete a global preset.
    Delete { name: String },
    /// Set a variable on a character.
    Set { name: String, value: i64 },
    /// List the active character's variables.
    Vars,
}

/// Why a command could not be parsed or run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommandError {
    /// Wrong arguments for a command; the text is the usage line.
    Usage(String),
    /// A formula that does not parse or evaluate; `source` is its text.
    Formula { source: String, error: Error },
    /// `delete` named a preset that does not exist.
    NoSuchPreset(String),
    /// A lone word that is neither a formula nor a saved preset.
    UnknownPreset {
        word: String,
        /// A saved name within edit distance 2 of `word`.
        suggestion: Option<String>,
    },
    /// Neither `XDG_CONFIG_HOME` nor `HOME` gives a config directory.
    NoConfigDir,
    /// The file given to `import` could not be read as a v1 presets file.
    Import { path: PathBuf, message: String },
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
            CommandError::NoSuchPreset(name) => write!(f, "no preset named '{name}'"),
            CommandError::UnknownPreset { word, .. } => {
                write!(f, "'{word}' is not a valid formula or a known preset")
            }
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

/// Parses a line of words into a command. `preset_names` lists the saved
/// preset names; it is only called when a lone word might be a preset name.
pub fn parse_command(
    words: &[String],
    preset_names: &mut dyn FnMut() -> Result<Vec<String>, CommandError>,
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
        Some("vars") => Ok(Command::Vars),
        Some("set") => match rest {
            [name, value] => Ok(Command::Set {
                name: validate_var_name(name)?,
                value: value
                    .parse()
                    .map_err(|_| CommandError::NotAnInteger(value.clone()))?,
            }),
            _ => Err(CommandError::Usage("set <name> <integer>".into())),
        },
        Some("presets") => Ok(Command::Presets),
        Some("import") => parse_import(rest),
        Some("delete") => match rest {
            [name] => Ok(Command::Delete { name: name.clone() }),
            _ => Err(CommandError::Usage("delete <name>".into())),
        },
        _ => roll_or_preset(words, preset_names),
    }
}

/// Checks a variable name and returns its stored (lowercase) form.
fn validate_var_name(raw: &str) -> Result<String, CommandError> {
    let name = raw.to_lowercase();
    let mut chars = name.chars();
    let valid = chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
    if valid {
        Ok(name)
    } else {
        Err(CommandError::InvalidVarName(raw.to_string()))
    }
}

/// `import <path> [--force]`, with the flag allowed anywhere after `import`.
fn parse_import(rest: &[String]) -> Result<Command, CommandError> {
    let usage = || CommandError::Usage("import <path> [--force]".into());
    let force = rest.iter().any(|w| w.eq_ignore_ascii_case("--force"));
    let mut paths = rest.iter().filter(|w| !w.eq_ignore_ascii_case("--force"));
    match (paths.next(), paths.next()) {
        (Some(path), None) if !path.starts_with("--") => Ok(Command::Import {
            path: PathBuf::from(path),
            force,
        }),
        _ => Err(usage()),
    }
}

/// A lone word that is not a formula but names a saved preset rolls that
/// preset; anything else is a formula.
fn roll_or_preset(
    words: &[String],
    preset_names: &mut dyn FnMut() -> Result<Vec<String>, CommandError>,
) -> Result<Command, CommandError> {
    if let [word] = words {
        let name = word.to_lowercase();
        // A name-shaped word that fails to parse as a formula (a syntax
        // error, not a bad dice group like `d6dl9`) may be a preset name.
        let not_a_formula = matches!(crate::parser::parse(word), Err(Error::Syntax { .. }));
        if not_a_formula && is_name_shaped(&name) {
            let names = preset_names()?;
            if names.contains(&name) {
                return Ok(Command::RollPreset(name));
            }
            let suggestion = names.into_iter().find(|n| edit_distance(n, &name) <= 2);
            return Err(CommandError::UnknownPreset {
                word: word.clone(),
                suggestion,
            });
        }
    }
    Ok(Command::Roll(words.join(" ")))
}

/// Where commands run: the config directory holding the presets file.
pub struct Context {
    /// `None` when no config directory could be found; commands that need
    /// the presets file then fail with [`CommandError::NoConfigDir`].
    pub config_dir: Option<PathBuf>,
}

impl Context {
    /// The characters store, or an error if there is no config directory.
    pub fn characters(&self) -> Result<CharacterStore, CommandError> {
        self.config_dir
            .as_deref()
            .map(CharacterStore::in_config_dir)
            .ok_or(CommandError::NoConfigDir)
    }

    /// The presets store, or an error if there is no config directory.
    pub fn store(&self) -> Result<Store, CommandError> {
        self.config_dir
            .as_deref()
            .map(Store::in_config_dir)
            .ok_or(CommandError::NoConfigDir)
    }
}

/// The config directory per the XDG spec: an absolute `xdg_config_home`,
/// else `home/.config`. An empty or relative `xdg_config_home` is ignored.
pub fn config_dir(xdg_config_home: Option<&Path>, home: Option<&Path>) -> Option<PathBuf> {
    match xdg_config_home {
        Some(dir) if dir.is_absolute() => Some(dir.to_path_buf()),
        _ => home
            .filter(|h| !h.as_os_str().is_empty())
            .map(|h| h.join(".config")),
    }
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
        /// The formula this save overwrote, if the name already existed.
        replaced: Option<String>,
    },
    Deleted {
        name: String,
    },
    Imported(ImportReport),
    /// Variables as (name, value), sorted by name.
    Vars(Vec<(String, i64)>),
    VarSet {
        name: String,
        value: i64,
        character: String,
    },
    /// Presets as (name, formula), sorted by name.
    Presets(Vec<(String, String)>),
}

/// What an import did.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ImportReport {
    /// Names added (or replaced, with `--force`).
    pub imported: Vec<String>,
    /// Entries left out, as (name as written, reason).
    pub skipped: Vec<(String, String)>,
}

/// Runs a command.
pub fn execute(
    command: &Command,
    ctx: &Context,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    let store = ctx.store()?;
    let vars = ctx.characters()?.load("default")?.vars;
    match command {
        Command::Roll(formula) => roll_formula(formula, None, &vars, rng),
        Command::RollPreset(name) => {
            let formula = store.load()?.remove(name).unwrap_or_default();
            roll_formula(&formula, Some((name.clone(), formula.clone())), &vars, rng)
        }
        Command::Save { name, formula } => {
            let name = validate_name(name).map_err(CommandError::InvalidName)?;
            check_formula(formula)?;
            let mut presets = store.load()?;
            let replaced = presets.insert(name.clone(), formula.clone());
            store.save(&presets)?;
            Ok(Output::Saved {
                name,
                formula: formula.clone(),
                replaced,
            })
        }
        Command::Delete { name } => {
            let name = name.to_lowercase();
            let mut presets = store.load()?;
            if presets.remove(&name).is_none() {
                return Err(CommandError::NoSuchPreset(name));
            }
            store.save(&presets)?;
            Ok(Output::Deleted { name })
        }
        Command::Import { path, force } => {
            let raw = std::fs::read_to_string(path).map_err(|e| CommandError::Import {
                path: path.clone(),
                message: e.to_string(),
            })?;
            let json: serde_json::Value =
                serde_json::from_str(&raw).map_err(|e| CommandError::Import {
                    path: path.clone(),
                    message: format!("not valid JSON: {e}"),
                })?;
            let entries = json.as_object().ok_or_else(|| CommandError::Import {
                path: path.clone(),
                message: "expected a JSON object of name to formula".into(),
            })?;
            let mut presets = store.load()?;
            let mut report = ImportReport::default();
            for (name, value) in entries {
                let skip = |reason: String| (name.clone(), reason);
                let key = match validate_name(name) {
                    Ok(key) => key,
                    Err(e) => {
                        report.skipped.push(skip(e.reason()));
                        continue;
                    }
                };
                let Some(formula) = value.as_str() else {
                    report.skipped.push(skip(format!(
                        "value must be a string, found {}",
                        json_kind(value)
                    )));
                    continue;
                };
                if let Err(e) = crate::parser::parse(formula) {
                    report
                        .skipped
                        .push(skip(format!("invalid formula: {}", e.message())));
                    continue;
                }
                if presets.contains_key(&key) && (!force || report.imported.contains(&key)) {
                    report
                        .skipped
                        .push(skip("already exists (use --force to overwrite)".into()));
                    continue;
                }
                presets.insert(key.clone(), formula.to_string());
                report.imported.push(key);
            }
            if !report.imported.is_empty() {
                store.save(&presets)?;
            }
            Ok(Output::Imported(report))
        }
        Command::Presets => Ok(Output::Presets(store.load()?.into_iter().collect())),
        Command::Set { name, value } => {
            let characters = ctx.characters()?;
            let mut character = characters.load("default")?;
            character.vars.insert(name.clone(), *value);
            characters.save("default", &character)?;
            Ok(Output::VarSet {
                name: name.clone(),
                value: *value,
                character: "default".into(),
            })
        }
        Command::Vars => {
            let character = ctx.characters()?.load("default")?;
            Ok(Output::Vars(character.vars.into_iter().collect()))
        }
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
    vars: &BTreeMap<String, i64>,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    crate::roll_with(formula, &|name| vars.get(name).copied(), rng)
        .map(|rolls| Output::Rolls { preset, rolls })
        .map_err(|error| CommandError::Formula {
            source: formula.to_string(),
            error,
        })
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

fn json_kind(value: &serde_json::Value) -> &'static str {
    match value {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "a boolean",
        serde_json::Value::Number(_) => "a number",
        serde_json::Value::String(_) => "a string",
        serde_json::Value::Array(_) => "an array",
        serde_json::Value::Object(_) => "an object",
    }
}
