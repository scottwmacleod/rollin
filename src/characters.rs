//! Characters: one TOML file each under `rollin/characters/` (ADR 0004),
//! holding integer variables and presets.

use crate::name::Name;
use crate::presets::{
    edit_document, read_presets, read_section, read_table, string_values, sync_section, StoreError,
};
use crate::system::{read_crit_range, read_system};
use crate::{CritRange, System};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// The character that always exists.
pub const DEFAULT: &str = "default";

/// A character's saved data.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Character {
    /// Variable name (lowercase) to value.
    pub vars: BTreeMap<String, i64>,
    /// Preset name to formula.
    pub presets: BTreeMap<String, String>,
    /// The game system this character plays under; `None` falls back to the
    /// global default, then to no system.
    pub system: Option<System>,
    /// The lowest kept d20 that is a critical hit under a system (`19` for
    /// 19-20); `None` means 20.
    pub crit_range: Option<CritRange>,
}

/// The characters directory inside a config directory.
pub struct CharacterStore {
    dir: PathBuf,
}

impl CharacterStore {
    pub fn in_config_dir(config_dir: &Path) -> Self {
        CharacterStore {
            dir: crate::paths::app_dir(config_dir).join("characters"),
        }
    }

    fn path(&self, name: &Name) -> PathBuf {
        self.dir.join(format!("{name}.toml"))
    }

    /// All character names, sorted. `default` is always one of them.
    pub fn names(&self) -> Result<Vec<Name>, StoreError> {
        let mut names = vec![Name::default_character()];
        match std::fs::read_dir(&self.dir) {
            Ok(entries) => {
                for entry in entries {
                    let entry = entry.map_err(|e| self.dir_error(e))?;
                    let file = entry.file_name().to_string_lossy().into_owned();
                    if let Some(name) = file.strip_suffix(".toml") {
                        if let Some(name) = Name::stored(name) {
                            if !names.contains(&name) {
                                names.push(name);
                            }
                        }
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(self.dir_error(e)),
        }
        names.sort();
        Ok(names)
    }

    fn dir_error(&self, e: std::io::Error) -> StoreError {
        StoreError {
            path: self.dir.clone(),
            message: e.to_string(),
        }
    }

    /// Deletes a character's file. A missing file is fine (the character was
    /// virtual).
    pub fn delete(&self, name: &Name) -> Result<(), StoreError> {
        match std::fs::remove_file(self.path(name)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(StoreError::at(&self.path(name), e.to_string())),
        }
    }

    /// Moves a character's file to a new name, keeping its contents. The
    /// caller has checked that `from` exists and `to` does not.
    pub fn rename(&self, from: &Name, to: &Name) -> Result<(), StoreError> {
        std::fs::rename(self.path(from), self.path(to))
            .map_err(|e| StoreError::at(&self.path(from), e.to_string()))
    }

    /// Whether a character exists (`default` always does).
    pub fn exists(&self, name: &Name) -> bool {
        name.as_str() == DEFAULT || self.path(name).is_file()
    }

    /// The name of the active character: `default` when no state file exists.
    pub fn active(&self) -> Result<Name, StoreError> {
        let path = self.state_path();
        let error = |message: &str| StoreError::at(&path, message);
        match read_table(&path)?.get("active") {
            None => Ok(Name::default_character()),
            Some(toml::Value::String(name)) => {
                Name::stored(name).ok_or_else(|| error("`active` must be a valid character name"))
            }
            Some(_) => Err(error("`active` must be a string")),
        }
    }

    /// Makes `name` the active character, atomically.
    pub fn set_active(&self, name: &Name) -> Result<(), StoreError> {
        // A corrupt state file is an error, never overwritten.
        self.active()?;
        let path = self.state_path();
        edit_document(&path, |doc| {
            let mut new = toml_edit::Value::from(name.as_str());
            if let Some(old) = doc.get("active").and_then(toml_edit::Item::as_value) {
                *new.decor_mut() = old.decor().clone();
            }
            doc["active"] = toml_edit::Item::Value(new);
            Ok(())
        })
    }

    fn state_path(&self) -> PathBuf {
        self.dir
            .parent()
            .expect("characters dir has a parent")
            .join("state.toml")
    }

    /// A character's data. A missing file means an empty character.
    pub fn load(&self, name: &Name) -> Result<Character, StoreError> {
        let path = self.path(name);
        let table = read_table(&path)?;
        Ok(Character {
            vars: read_section(&table, &path, "vars", "variable", "an integer", |v| {
                v.as_integer()
            })?,
            presets: read_presets(&table, &path)?,
            system: read_system(&table, &path)?,
            crit_range: read_crit_range(&table, &path)?,
        })
    }

    /// Makes a character's file hold exactly `character`, atomically. An
    /// existing file is edited in place, so hand-written text survives.
    pub fn save(&self, name: &Name, character: &Character) -> Result<(), StoreError> {
        let vars = character
            .vars
            .iter()
            .map(|(var, value)| (var.clone(), toml_edit::Value::from(*value)))
            .collect();
        edit_document(&self.path(name), |doc| {
            sync_system(doc, character.system);
            sync_crit_range(doc, character.crit_range);
            sync_section(doc, "vars", vars)?;
            sync_section(doc, "presets", string_values(&character.presets))
        })
    }
}

/// Makes the top-level `system` key hold `system` (absent for `None`), keeping
/// an unchanged key, with its comments, as it is.
fn sync_system(doc: &mut toml_edit::DocumentMut, system: Option<System>) {
    let Some(system) = system else {
        doc.remove("system");
        return;
    };
    let old = doc.get("system").and_then(toml_edit::Item::as_value);
    if old.and_then(toml_edit::Value::as_str) == Some(system.as_str()) {
        return;
    }
    let mut new = toml_edit::Value::from(system.as_str());
    if let Some(old) = old {
        *new.decor_mut() = old.decor().clone();
    }
    doc["system"] = toml_edit::Item::Value(new);
}

/// Makes the top-level `crit_range` key hold `range` (absent for `None`),
/// keeping an unchanged key, with its comments, as it is.
fn sync_crit_range(doc: &mut toml_edit::DocumentMut, range: Option<CritRange>) {
    let Some(range) = range else {
        doc.remove("crit_range");
        return;
    };
    let old = doc.get("crit_range").and_then(toml_edit::Item::as_value);
    let value = i64::from(range.get());
    if old.and_then(toml_edit::Value::as_integer) == Some(value) {
        return;
    }
    let mut new = toml_edit::Value::from(value);
    if let Some(old) = old {
        *new.decor_mut() = old.decor().clone();
    }
    doc["crit_range"] = toml_edit::Item::Value(new);
}
