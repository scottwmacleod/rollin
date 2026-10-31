//! Characters: one TOML file each under `rollin/characters/` (ADR 0004),
//! holding integer variables and presets.

use crate::presets::{is_name_shaped, write_atomic, StoreError};
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
}

/// The characters directory inside a config directory.
pub struct CharacterStore {
    dir: PathBuf,
}

impl CharacterStore {
    pub fn in_config_dir(config_dir: &Path) -> Self {
        CharacterStore {
            dir: config_dir.join("rollin").join("characters"),
        }
    }

    fn path(&self, name: &str) -> PathBuf {
        self.dir.join(format!("{name}.toml"))
    }

    /// All character names, sorted. `default` is always one of them.
    pub fn names(&self) -> Result<Vec<String>, StoreError> {
        let mut names = vec![DEFAULT.to_string()];
        match std::fs::read_dir(&self.dir) {
            Ok(entries) => {
                for entry in entries {
                    let entry = entry.map_err(|e| self.dir_error(e))?;
                    let file = entry.file_name().to_string_lossy().into_owned();
                    if let Some(name) = file.strip_suffix(".toml") {
                        if is_name_shaped(name) && !names.iter().any(|n| n == name) {
                            names.push(name.to_string());
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
    pub fn delete(&self, name: &str) -> Result<(), StoreError> {
        match std::fs::remove_file(self.path(name)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(StoreError {
                path: self.path(name),
                message: e.to_string(),
            }),
        }
    }

    /// Whether a character exists (`default` always does).
    pub fn exists(&self, name: &str) -> bool {
        name == DEFAULT || self.path(name).is_file()
    }

    /// The name of the active character: `default` when no state file exists.
    pub fn active(&self) -> Result<String, StoreError> {
        let path = self.state_path();
        let error = |message: String| StoreError {
            path: path.clone(),
            message,
        };
        let raw = match std::fs::read_to_string(&path) {
            Ok(raw) => raw,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(DEFAULT.into()),
            Err(e) => return Err(error(e.to_string())),
        };
        let table: toml::Table = raw
            .parse()
            .map_err(|e: toml::de::Error| error(format!("not valid TOML: {}", e.message())))?;
        match table.get("active") {
            None => Ok(DEFAULT.into()),
            Some(toml::Value::String(name)) if is_name_shaped(name) => Ok(name.clone()),
            Some(toml::Value::String(_)) => {
                Err(error("`active` must be a valid character name".into()))
            }
            Some(_) => Err(error("`active` must be a string".into())),
        }
    }

    /// Makes `name` the active character, atomically.
    pub fn set_active(&self, name: &str) -> Result<(), StoreError> {
        // A corrupt state file is an error, never overwritten.
        self.active()?;
        let path = self.state_path();
        let mut root = toml::Table::new();
        root.insert("active".into(), toml::Value::String(name.to_string()));
        let text = toml::to_string(&root).map_err(|e| StoreError {
            path: path.clone(),
            message: e.to_string(),
        })?;
        write_atomic(&path, &text)
    }

    fn state_path(&self) -> PathBuf {
        self.dir
            .parent()
            .expect("characters dir has a parent")
            .join("state.toml")
    }

    /// A character's data. A missing file means an empty character.
    pub fn load(&self, name: &str) -> Result<Character, StoreError> {
        let path = self.path(name);
        let error = |message: String| StoreError {
            path: path.clone(),
            message,
        };
        let raw = match std::fs::read_to_string(&path) {
            Ok(raw) => raw,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Character::default()),
            Err(e) => return Err(error(e.to_string())),
        };
        let table: toml::Table = raw
            .parse()
            .map_err(|e: toml::de::Error| error(format!("not valid TOML: {}", e.message())))?;
        let mut character = Character::default();
        if let Some(section) = table.get("vars") {
            let section = section
                .as_table()
                .ok_or_else(|| error("`vars` must be a table".into()))?;
            for (var, value) in section {
                let value = value
                    .as_integer()
                    .ok_or_else(|| error(format!("variable '{var}' must be an integer")))?;
                character.vars.insert(var.to_lowercase(), value);
            }
        }
        if let Some(section) = table.get("presets") {
            let section = section
                .as_table()
                .ok_or_else(|| error("`presets` must be a table".into()))?;
            for (preset, formula) in section {
                let formula = formula
                    .as_str()
                    .ok_or_else(|| error(format!("preset '{preset}' must be a string")))?;
                character
                    .presets
                    .insert(preset.to_lowercase(), formula.to_string());
            }
        }
        Ok(character)
    }

    /// Replaces a character's file, atomically.
    pub fn save(&self, name: &str, character: &Character) -> Result<(), StoreError> {
        let mut vars = toml::Table::new();
        for (var, value) in &character.vars {
            vars.insert(var.clone(), toml::Value::Integer(*value));
        }
        let mut presets = toml::Table::new();
        for (preset, formula) in &character.presets {
            presets.insert(preset.clone(), toml::Value::String(formula.clone()));
        }
        let mut root = toml::Table::new();
        root.insert("vars".into(), toml::Value::Table(vars));
        root.insert("presets".into(), toml::Value::Table(presets));
        let path = self.path(name);
        let text = toml::to_string(&root).map_err(|e| StoreError {
            path: path.clone(),
            message: e.to_string(),
        })?;
        write_atomic(&path, &text)
    }
}
