//! Characters: one TOML file each under `rollin/characters/` (ADR 0004),
//! holding integer variables and presets.

use crate::presets::{write_atomic, StoreError};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

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
        Ok(character)
    }

    /// Replaces a character's file, atomically.
    pub fn save(&self, name: &str, character: &Character) -> Result<(), StoreError> {
        let mut vars = toml::Table::new();
        for (var, value) in &character.vars {
            vars.insert(var.clone(), toml::Value::Integer(*value));
        }
        let mut root = toml::Table::new();
        root.insert("vars".into(), toml::Value::Table(vars));
        let path = self.path(name);
        let text = toml::to_string(&root).map_err(|e| StoreError {
            path: path.clone(),
            message: e.to_string(),
        })?;
        write_atomic(&path, &text)
    }
}
