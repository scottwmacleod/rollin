//! The global presets store: a TOML file in the config directory (ADR 0004).
//!
//! Format: a `[presets]` table of `name = "formula"`. Writes are atomic: a
//! temp file in the same directory is written, then renamed over the target.

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

/// The presets file inside a config directory.
pub struct Store {
    path: PathBuf,
}

impl Store {
    /// The store for a config directory (the file is `rollin/presets.toml`).
    pub fn in_config_dir(config_dir: &Path) -> Self {
        Store {
            path: config_dir.join("rollin").join("presets.toml"),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// All presets, name to formula. A missing file means no presets.
    pub fn load(&self) -> Result<BTreeMap<String, String>, StoreError> {
        let raw = match std::fs::read_to_string(&self.path) {
            Ok(raw) => raw,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeMap::new()),
            Err(e) => return Err(self.error(e.to_string())),
        };
        let table: toml::Table = raw
            .parse()
            .map_err(|e: toml::de::Error| self.error(format!("not valid TOML: {}", e.message())))?;
        let mut presets = BTreeMap::new();
        if let Some(section) = table.get("presets") {
            let section = section
                .as_table()
                .ok_or_else(|| self.error("`presets` must be a table".into()))?;
            for (name, formula) in section {
                let formula = formula
                    .as_str()
                    .ok_or_else(|| self.error(format!("preset '{name}' must be a string")))?;
                presets.insert(name.to_lowercase(), formula.to_string());
            }
        }
        Ok(presets)
    }

    /// Replaces the file's contents with `presets`, atomically.
    pub fn save(&self, presets: &BTreeMap<String, String>) -> Result<(), StoreError> {
        let mut section = toml::Table::new();
        for (name, formula) in presets {
            section.insert(name.clone(), toml::Value::String(formula.clone()));
        }
        let mut root = toml::Table::new();
        root.insert("presets".into(), toml::Value::Table(section));
        let text = toml::to_string(&root).map_err(|e| self.error(e.to_string()))?;
        self.write_atomic(&text)
    }

    fn write_atomic(&self, text: &str) -> Result<(), StoreError> {
        use std::io::Write;
        let dir = self.path.parent().expect("store path has a parent");
        std::fs::create_dir_all(dir).map_err(|e| self.error(e.to_string()))?;
        let tmp = dir.join(format!(".presets.toml.{}.tmp", std::process::id()));
        let written = (|| {
            let mut file = std::fs::File::create(&tmp)?;
            file.write_all(text.as_bytes())?;
            file.sync_all()?;
            std::fs::rename(&tmp, &self.path)
        })();
        written.map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            self.error(e.to_string())
        })
    }

    fn error(&self, message: String) -> StoreError {
        StoreError {
            path: self.path.clone(),
            message,
        }
    }
}

/// Words the command parser treats as commands.
pub const COMMAND_WORDS: [&str; 5] = ["save", "presets", "delete", "import", "roll"];

/// Words the formula lexer and parser treat as keywords.
const DICE_KEYWORDS: [&str; 12] = [
    "d", "df", "dl", "dh", "kl", "kh", "r", "rr", "p", "f", "adv", "dis",
];

/// Why a string cannot be a preset name. The name is as the user typed it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NameError {
    pub name: String,
    pub rule: NameRule,
}

/// The rule a rejected name broke.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NameRule {
    /// Not `[a-z][a-z0-9_-]*` after lowercasing.
    Shape,
    CommandWord,
    DiceKeyword,
    /// The name parses as a complete dice formula.
    ParsesAsFormula,
}

impl std::fmt::Display for NameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = &self.name;
        write!(f, "invalid preset name '{name}': ")?;
        match self.rule {
            NameRule::Shape => write!(
                f,
                "names must start with a letter and use only letters, digits, '_' or '-'"
            ),
            NameRule::CommandWord => {
                write!(f, "it is a command word ({})", COMMAND_WORDS.join(", "))
            }
            NameRule::DiceKeyword => write!(f, "it is a reserved dice keyword"),
            NameRule::ParsesAsFormula => {
                write!(f, "it would parse as the dice formula {name}")
            }
        }
    }
}

impl std::error::Error for NameError {}

/// Checks a preset name and returns its stored (lowercase) form.
pub fn validate_name(raw: &str) -> Result<String, NameError> {
    let name = raw.to_lowercase();
    let fail = |rule| NameError {
        name: raw.to_string(),
        rule,
    };
    if !is_name_shaped(&name) {
        Err(fail(NameRule::Shape))
    } else if COMMAND_WORDS.contains(&name.as_str()) {
        Err(fail(NameRule::CommandWord))
    } else if DICE_KEYWORDS.contains(&name.as_str()) {
        Err(fail(NameRule::DiceKeyword))
    } else if crate::parser::parse(&name).is_ok() {
        Err(fail(NameRule::ParsesAsFormula))
    } else {
        Ok(name)
    }
}

/// Whether `name` matches `[a-z][a-z0-9_-]*`.
pub(crate) fn is_name_shaped(name: &str) -> bool {
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}
