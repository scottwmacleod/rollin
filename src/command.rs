//! The shared command layer: one parser from a list of words to a [`Command`],
//! and one executor that runs it against a [`Context`]. The one-shot binary
//! and the later interactive session both use it. It never prints.

use crate::characters::{Character, CharacterStore, DEFAULT};
use crate::presets::{is_name_shaped, validate_name, NameError, NameRule, Store, StoreError};
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
    CharSwitch(String),
    /// Delete a character.
    CharDelete(String),
    /// Create an empty character and make it active.
    CharNew(String),
    /// List the active character's variables.
    Vars,
}

/// Details of an undefined variable, for a helpful message.
#[derive(Debug, Clone, PartialEq, Eq)]
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

/// Parses a line of words into a command. `preset_names` lists the saved
/// preset names; it is only called when a lone word might be a preset name.
pub fn parse_command(
    words: &[String],
    preset_names: &mut dyn FnMut() -> Result<Vec<String>, CommandError>,
) -> Result<Command, CommandError> {
    let first = words.first().map(|w| w.to_lowercase());
    let rest = words.get(1..).unwrap_or_default();
    match first.as_deref() {
        Some("save") => {
            let (rest, global) = take_flag(rest, "--global");
            match rest.as_slice() {
                [name, formula @ ..] if !formula.is_empty() => Ok(Command::Save {
                    name: name.clone(),
                    formula: formula.join(" "),
                    global,
                }),
                _ => Err(CommandError::Usage(
                    "save <name> <formula> [--global]".into(),
                )),
            }
        }
        Some("roll") if rest.is_empty() => {
            Err(CommandError::Usage("roll <formula or preset name>".into()))
        }
        Some("roll") => roll_or_preset(rest, preset_names),
        Some("characters") => Ok(Command::Characters),
        Some("char") => match rest {
            [] => Ok(Command::CharShow),
            [delete, name] if delete.eq_ignore_ascii_case("delete") => {
                Ok(Command::CharDelete(name.to_lowercase()))
            }
            [new, name] if new.eq_ignore_ascii_case("new") => {
                Ok(Command::CharNew(name.to_lowercase()))
            }
            [new] if new.eq_ignore_ascii_case("new") => {
                Err(CommandError::Usage("char new <name>".into()))
            }
            [name] => Ok(Command::CharSwitch(name.to_lowercase())),
            _ => Err(CommandError::Usage("char [<name> | new <name>]".into())),
        },
        Some("unset") => match rest {
            [name] => Ok(Command::Unset {
                name: name.to_lowercase(),
            }),
            _ => Err(CommandError::Usage("unset <name>".into())),
        },
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
        Some("delete") => {
            let (rest, global) = take_flag(rest, "--global");
            match rest.as_slice() {
                [name] => Ok(Command::Delete {
                    name: name.clone(),
                    global,
                }),
                _ => Err(CommandError::Usage("delete <name> [--global]".into())),
            }
        }
        _ => roll_or_preset(words, preset_names),
    }
}

/// Errors unless the character exists, suggesting a near miss.
fn require_character(characters: &CharacterStore, name: &str) -> Result<(), CommandError> {
    if characters.exists(name) {
        return Ok(());
    }
    let suggestion = characters
        .names()?
        .into_iter()
        .find(|n| edit_distance(n, name) <= 2);
    Err(CommandError::NoSuchCharacter {
        name: name.to_string(),
        suggestion,
    })
}

/// Checks a character name and returns its stored (lowercase) form.
fn validate_char_name(raw: &str) -> Result<String, CommandError> {
    if raw.eq_ignore_ascii_case("new") {
        return Err(CommandError::InvalidCharName(NameError {
            name: raw.to_string(),
            rule: NameRule::CommandWord,
        }));
    }
    validate_name(raw).map_err(CommandError::InvalidCharName)
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

/// Splits `flag` (any case, anywhere) out of `words`; true if it was there.
fn take_flag(words: &[String], flag: &str) -> (Vec<String>, bool) {
    let mut found = false;
    let rest = words
        .iter()
        .filter(|w| {
            let is_flag = w.eq_ignore_ascii_case(flag);
            found |= is_flag;
            !is_flag
        })
        .cloned()
        .collect();
    (rest, found)
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
    /// A character chosen for this call only (`--char`); it never persists.
    pub character: Option<String>,
}

impl Context {
    /// A context over `config_dir` with no `--char` override.
    pub fn new(config_dir: Option<PathBuf>) -> Self {
        Context {
            config_dir,
            character: None,
        }
    }

    /// The character this call acts on: the `--char` override (which must
    /// exist) or else the persisted active character (not checked).
    fn acting_name(&self, characters: &CharacterStore) -> Result<String, CommandError> {
        match &self.character {
            Some(name) => {
                let name = name.to_lowercase();
                require_character(characters, &name)?;
                Ok(name)
            }
            None => Ok(characters.active()?),
        }
    }

    /// The store and name of the character whose data this call reads and
    /// writes. The character must exist (`default` always does).
    fn current(&self) -> Result<(CharacterStore, String), CommandError> {
        let characters = self.characters()?;
        let name = self.acting_name(&characters)?;
        if !characters.exists(&name) {
            return Err(CommandError::ActiveCharacterMissing(name));
        }
        Ok((characters, name))
    }

    /// The characters store, or an error if there is no config directory.
    pub fn characters(&self) -> Result<CharacterStore, CommandError> {
        self.config_dir
            .as_deref()
            .map(CharacterStore::in_config_dir)
            .ok_or(CommandError::NoConfigDir)
    }

    /// Every preset name rolling can reach: the character's own and global.
    pub fn preset_names(&self) -> Result<Vec<String>, CommandError> {
        let (characters, name) = self.current()?;
        let mut names: Vec<String> = characters.load(&name)?.presets.into_keys().collect();
        names.extend(self.store()?.load()?.into_keys());
        names.sort();
        names.dedup();
        Ok(names)
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

/// Runs a command.
pub fn execute(
    command: &Command,
    ctx: &Context,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    let store = ctx.store()?;
    match command {
        Command::Roll(formula) => {
            let scope = Scope::load(ctx)?;
            roll_formula(formula, None, &scope, rng)
        }
        Command::RollPreset(name) => {
            let scope = Scope::load(ctx)?;
            let formula = match scope.presets.get(name) {
                Some(formula) => formula.clone(),
                None => store.load()?.remove(name).unwrap_or_default(),
            };
            roll_formula(&formula, Some((name.clone(), formula.clone())), &scope, rng)
        }
        Command::Save {
            name,
            formula,
            global,
        } => {
            let name = validate_name(name).map_err(CommandError::InvalidName)?;
            check_formula(formula)?;
            if *global {
                let mut presets = store.load()?;
                let replaced = presets.insert(name.clone(), formula.clone());
                store.save(&presets)?;
                return Ok(Output::Saved {
                    name,
                    formula: formula.clone(),
                    character: None,
                    replaced,
                });
            }
            let (characters, active) = ctx.current()?;
            let mut character = characters.load(&active)?;
            let replaced = character.presets.insert(name.clone(), formula.clone());
            characters.save(&active, &character)?;
            Ok(Output::Saved {
                name,
                formula: formula.clone(),
                character: Some(active),
                replaced,
            })
        }
        Command::Delete { name, global } => {
            let name = name.to_lowercase();
            let mut globals = store.load()?;
            if *global {
                if globals.remove(&name).is_none() {
                    return Err(CommandError::NoSuchPreset(name));
                }
                store.save(&globals)?;
                return Ok(Output::Deleted {
                    name,
                    character: None,
                });
            }
            let (characters, active) = ctx.current()?;
            let mut character = characters.load(&active)?;
            if character.presets.remove(&name).is_none() {
                return Err(CommandError::NoSuchCharacterPreset {
                    global_exists: globals.contains_key(&name),
                    name,
                    character: active,
                });
            }
            characters.save(&active, &character)?;
            Ok(Output::Deleted {
                name,
                character: Some(active),
            })
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
        Command::Presets => {
            let (characters, active) = ctx.current()?;
            let own_presets = characters.load(&active)?.presets;
            let global_presets = store.load()?;
            let own = own_presets.iter().map(|(name, formula)| PresetEntry {
                name: name.clone(),
                formula: formula.clone(),
                source: PresetSource::Character(active.clone()),
                shadow: if global_presets.contains_key(name) {
                    Shadow::Shadows
                } else {
                    Shadow::None
                },
            });
            let global = global_presets.iter().map(|(name, formula)| PresetEntry {
                name: name.clone(),
                formula: formula.clone(),
                source: PresetSource::Global,
                shadow: if own_presets.contains_key(name) {
                    Shadow::ShadowedBy(active.clone())
                } else {
                    Shadow::None
                },
            });
            Ok(Output::Presets(own.chain(global).collect()))
        }
        Command::Set { name, value } => {
            let (characters, active) = ctx.current()?;
            let mut character = characters.load(&active)?;
            character.vars.insert(name.clone(), *value);
            characters.save(&active, &character)?;
            Ok(Output::VarSet {
                name: name.clone(),
                value: *value,
                character: active,
            })
        }
        Command::Characters => {
            let characters = ctx.characters()?;
            Ok(Output::Characters {
                names: characters.names()?,
                active: ctx.acting_name(&characters)?,
            })
        }
        Command::CharShow => {
            let characters = ctx.characters()?;
            Ok(Output::ActiveCharacter(ctx.acting_name(&characters)?))
        }
        Command::CharSwitch(name) => {
            let characters = ctx.characters()?;
            require_character(&characters, name)?;
            characters.set_active(name)?;
            Ok(Output::CharSwitched(name.clone()))
        }
        Command::CharDelete(name) => {
            let characters = ctx.characters()?;
            if name == DEFAULT {
                return Err(CommandError::CannotDeleteDefault);
            }
            require_character(&characters, name)?;
            let was_active = characters.active()? == *name;
            characters.delete(name)?;
            if was_active {
                characters.set_active(DEFAULT)?;
            }
            Ok(Output::CharDeleted {
                name: name.clone(),
                was_active,
            })
        }
        Command::CharNew(name) => {
            let characters = ctx.characters()?;
            let name = validate_char_name(name)?;
            if characters.exists(&name) {
                return Err(CommandError::CharacterExists(name));
            }
            let name = &name;
            characters.active()?;
            characters.save(name, &Character::default())?;
            characters.set_active(name)?;
            Ok(Output::CharCreated(name.clone()))
        }
        Command::Unset { name } => {
            let (characters, active) = ctx.current()?;
            let mut character = characters.load(&active)?;
            if character.vars.remove(name).is_none() {
                return Err(CommandError::NoSuchVariable {
                    name: name.clone(),
                    character: active,
                });
            }
            characters.save(&active, &character)?;
            Ok(Output::VarUnset {
                name: name.clone(),
                character: active,
            })
        }
        Command::Vars => {
            let (characters, active) = ctx.current()?;
            let character = characters.load(&active)?;
            Ok(Output::Vars(character.vars.into_iter().collect()))
        }
    }
}

/// Whether `formula` is acceptable to save. Variables are not known until
/// the preset is rolled, so each `@name` stands in as 2 and any non-syntax
/// error that touches a variable is ignored (it may only be the stand-in's
/// fault). Real syntax errors, and every error in a formula without
/// variables, are reported.
fn check_formula(formula: &str) -> Result<(), CommandError> {
    match crate::parser::parse_with(formula, &|_| Some(2)) {
        Ok(_) => Ok(()),
        Err(Error::WithVariables { inner, .. }) => match *inner {
            Error::Syntax { .. } => Err(CommandError::Formula {
                source: formula.to_string(),
                // Without the stand-in value, which the user never typed.
                error: *inner,
            }),
            _ => Ok(()),
        },
        Err(error) => Err(CommandError::Formula {
            source: formula.to_string(),
            error,
        }),
    }
}

/// The character whose variables a formula is rolled against.
struct Scope {
    name: String,
    vars: BTreeMap<String, i64>,
    /// The character's own presets, which shadow global ones.
    presets: BTreeMap<String, String>,
    /// Whether the character was chosen with `--char`.
    explicit: bool,
}

impl Scope {
    fn load(ctx: &Context) -> Result<Scope, CommandError> {
        let (characters, name) = ctx.current()?;
        let character = characters.load(&name)?;
        Ok(Scope {
            name,
            vars: character.vars,
            presets: character.presets,
            explicit: ctx.character.is_some(),
        })
    }

    /// Turns a library error for `source` into a command error, adding the
    /// character's details to an undefined variable.
    fn error(&self, source: &str, error: Error) -> CommandError {
        match &error {
            Error::UndefinedVariable { name, .. } => {
                let suggestion = self
                    .vars
                    .keys()
                    .filter(|v| edit_distance(v, name) <= 2)
                    .min_by_key(|v| edit_distance(v, name))
                    .cloned();
                CommandError::UndefinedVariable(Box::new(UndefinedVariable {
                    source: source.to_string(),
                    name: name.clone(),
                    character: self.name.clone(),
                    defined: self.vars.keys().cloned().collect(),
                    suggestion,
                    explicit: self.explicit,
                    error,
                }))
            }
            _ => CommandError::Formula {
                source: source.to_string(),
                error,
            },
        }
    }
}

fn roll_formula(
    formula: &str,
    preset: Option<(String, String)>,
    scope: &Scope,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    crate::roll_with(formula, &|name| scope.vars.get(name).copied(), rng)
        .map(|rolls| Output::Rolls { preset, rolls })
        .map_err(|error| scope.error(formula, error))
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
