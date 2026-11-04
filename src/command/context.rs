use super::{edit_distance, CommandError};
use crate::characters::{CharacterStore, DEFAULT};
use crate::completion::CompletionData;
use crate::name::Name;
use crate::presets::Store;
use crate::session::SESSION_WORDS;
use std::path::PathBuf;

/// Errors unless the character exists, suggesting a near miss.
pub(super) fn require_character(
    characters: &CharacterStore,
    name: &Name,
) -> Result<(), CommandError> {
    if characters.exists(name) {
        return Ok(());
    }
    let suggestion = characters
        .names()?
        .into_iter()
        .find(|n| edit_distance(n.as_str(), name.as_str()) <= 2)
        .map(Name::into_string);
    Err(CommandError::NoSuchCharacter {
        name: name.to_string(),
        suggestion,
    })
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
    pub(super) fn acting_name(&self, characters: &CharacterStore) -> Result<Name, CommandError> {
        match &self.character {
            Some(name) => {
                let name = Name::shaped(name).map_err(CommandError::InvalidCharName)?;
                require_character(characters, &name)?;
                Ok(name)
            }
            None => Ok(characters.active()?),
        }
    }

    /// The store and name of the character whose data this call reads and
    /// writes. The character must exist (`default` always does).
    pub(super) fn current(&self) -> Result<(CharacterStore, Name), CommandError> {
        let characters = self.characters()?;
        let name = self.acting_name(&characters)?;
        if !characters.exists(&name) {
            return Err(CommandError::ActiveCharacterMissing {
                name: name.into_string(),
            });
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

    /// The session prompt: `rollin> ` for the `default` character, else
    /// `rollin[<character>]> `. A broken setting gives the plain prompt (the
    /// command that needs the character reports the error).
    pub fn prompt(&self) -> String {
        match self.characters().and_then(|c| Ok(c.active()?)) {
            Ok(name) if name.as_str() != DEFAULT => format!("rollin[{name}]> "),
            _ => "rollin> ".to_string(),
        }
    }

    /// What completion can offer right now, read fresh from the store. Each
    /// list that fails to load is simply empty: completing never errors.
    pub fn completion_data(&self) -> CompletionData {
        let character = self.current().ok().and_then(|(characters, name)| {
            Some((
                characters
                    .names()
                    .ok()?
                    .into_iter()
                    .map(Name::into_string)
                    .collect(),
                characters.load(&name).ok()?,
            ))
        });
        let (characters, own) = character.unwrap_or_default();
        let global = self.store().and_then(|s| Ok(s.load()?)).unwrap_or_default();
        let mut presets: Vec<String> = Vec::new();
        for name in own.presets.into_keys().chain(global.into_keys()) {
            if !presets.contains(&name) {
                presets.push(name);
            }
        }
        CompletionData {
            presets,
            characters,
            variables: own.vars.into_keys().collect(),
            session_words: SESSION_WORDS.iter().map(|w| w.to_string()).collect(),
        }
    }

    /// The presets store, or an error if there is no config directory.
    pub fn store(&self) -> Result<Store, CommandError> {
        self.config_dir
            .as_deref()
            .map(Store::in_config_dir)
            .ok_or(CommandError::NoConfigDir)
    }
}
