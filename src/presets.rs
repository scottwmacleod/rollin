//! The global presets store: a TOML file in the config directory (ADR 0004).
//!
//! Format: a `[presets]` table of `name = "formula"`. Writes are atomic: a
//! temp file in the same directory is written, then renamed over the target.

use crate::name::normalise;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Why a store operation failed. `path` is always the file involved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoreError {
    pub path: PathBuf,
    pub message: String,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.path.display(), self.message)
    }
}

impl std::error::Error for StoreError {}

impl StoreError {
    pub(crate) fn at(path: &Path, message: impl Into<String>) -> Self {
        StoreError {
            path: path.to_path_buf(),
            message: message.into(),
        }
    }
}

/// The text of the store file at `path`; a missing file reads as empty.
pub(crate) fn read_text(path: &Path) -> Result<String, StoreError> {
    match std::fs::read_to_string(path) {
        Ok(raw) => Ok(raw),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(StoreError::at(path, e.to_string())),
    }
}

/// The TOML table in the store file at `path`; a missing file is an empty
/// table.
pub(crate) fn read_table(path: &Path) -> Result<toml::Table, StoreError> {
    read_text(path)?.parse().map_err(|e: toml::de::Error| {
        StoreError::at(path, format!("not valid TOML: {}", e.message()))
    })
}

/// The `[section]` table of `table` as name (lowercased) to value. An absent
/// section is empty. `kind` names an entry in errors, `expected` its type.
pub(crate) fn read_section<V>(
    table: &toml::Table,
    path: &Path,
    section: &str,
    kind: &str,
    expected: &str,
    convert: impl Fn(&toml::Value) -> Option<V>,
) -> Result<BTreeMap<String, V>, StoreError> {
    let mut entries = BTreeMap::new();
    if let Some(found) = table.get(section) {
        let found = found
            .as_table()
            .ok_or_else(|| StoreError::at(path, format!("`{section}` must be a table")))?;
        for (name, value) in found {
            let value = convert(value).ok_or_else(|| {
                StoreError::at(path, format!("{kind} '{name}' must be {expected}"))
            })?;
            entries.insert(normalise(name), value);
        }
    }
    Ok(entries)
}

/// The presets file inside a config directory.
pub struct Store {
    path: PathBuf,
}

impl Store {
    /// The store for a config directory (the file is `rollin/presets.toml`).
    pub fn in_config_dir(config_dir: &Path) -> Self {
        Store {
            path: crate::paths::app_dir(config_dir).join("presets.toml"),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// All presets, name to formula. A missing file means no presets.
    pub fn load(&self) -> Result<BTreeMap<String, String>, StoreError> {
        read_presets(&read_table(&self.path)?, &self.path)
    }

    /// Makes the file hold exactly `presets`, atomically. An existing file is
    /// edited in place, so hand-written comments and layout survive.
    pub fn save(&self, presets: &BTreeMap<String, String>) -> Result<(), StoreError> {
        edit_document(&self.path, |doc| {
            sync_section(doc, "presets", string_values(presets))
        })
    }
}

/// The `[presets]` section of a store file: name to formula.
pub(crate) fn read_presets(
    table: &toml::Table,
    path: &Path,
) -> Result<BTreeMap<String, String>, StoreError> {
    read_section(table, path, "presets", "preset", "a string", |v| {
        v.as_str().map(str::to_string)
    })
}

/// The values of a name-to-text map as TOML values.
pub(crate) fn string_values(map: &BTreeMap<String, String>) -> BTreeMap<String, toml_edit::Value> {
    map.iter()
        .map(|(k, v)| (k.clone(), toml_edit::Value::from(v.as_str())))
        .collect()
}

/// Reads the TOML file at `path` (empty when missing), applies `edit`, and
/// writes the result back atomically. Untouched parts of an existing
/// document keep their comments, order and formatting.
pub(crate) fn edit_document(
    path: &Path,
    edit: impl FnOnce(&mut toml_edit::DocumentMut) -> Result<(), String>,
) -> Result<(), StoreError> {
    let mut doc: toml_edit::DocumentMut =
        read_text(path)?
            .parse()
            .map_err(|e: toml_edit::TomlError| {
                StoreError::at(path, format!("not valid TOML: {}", e.message()))
            })?;
    edit(&mut doc).map_err(|message| StoreError::at(path, message))?;
    write_atomic(path, &doc.to_string())
}

/// Makes the `[section]` table hold exactly `entries` (keys compared in
/// lowercase). Keys already present with the right value are left untouched;
/// a changed value keeps its key and surrounding comments; new keys are
/// appended; missing ones are removed.
pub(crate) fn sync_section(
    doc: &mut toml_edit::DocumentMut,
    section: &str,
    mut entries: BTreeMap<String, toml_edit::Value>,
) -> Result<(), String> {
    use toml_edit::{Item, Table};
    let item = doc
        .entry(section)
        .or_insert_with(|| Item::Table(Table::new()));
    let table = item
        .as_table_like_mut()
        .ok_or_else(|| format!("`{section}` must be a table"))?;
    let stale: Vec<String> = table
        .iter()
        .map(|(key, _)| key.to_string())
        .filter(|key| !entries.contains_key(&normalise(key)))
        .collect();
    for key in stale {
        table.remove(&key);
    }
    for (key, old) in table.iter_mut() {
        let Some(new) = entries.remove(&normalise(key.get())) else {
            continue;
        };
        let unchanged = match (old.as_value(), &new) {
            (Some(old), new) => {
                old.as_str() == new.as_str() && old.as_integer() == new.as_integer()
            }
            _ => false,
        };
        if !unchanged {
            let mut new = new;
            if let Some(old) = old.as_value() {
                *new.decor_mut() = old.decor().clone();
            }
            *old = Item::Value(new);
        }
    }
    for (key, value) in entries {
        table.insert(&key, Item::Value(value));
    }
    Ok(())
}

/// Writes `text` to `path` atomically: a temp file in the same directory is
/// written and synced, then renamed over the target. Creates the directory.
pub(crate) fn write_atomic(path: &Path, text: &str) -> Result<(), StoreError> {
    use std::io::Write;
    let error = |message: String| StoreError::at(path, message);
    let dir = path.parent().expect("store path has a parent");
    std::fs::create_dir_all(dir).map_err(|e| error(e.to_string()))?;
    let file_name = path.file_name().expect("store path has a file name");
    let tmp = dir.join(format!(
        ".{}.{}.tmp",
        file_name.to_string_lossy(),
        std::process::id()
    ));
    let written = (|| {
        let mut file = std::fs::File::create(&tmp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&tmp, path)
    })();
    written.map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        error(e.to_string())
    })
}
