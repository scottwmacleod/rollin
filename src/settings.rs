//! Global settings: `rollin/settings.toml` in the config directory (ADR 0004).
//!
//! Format: an optional `system = "dnd5e"`, the default game system for any
//! character that does not name its own.

use crate::presets::{read_table, StoreError};
use crate::system::read_system;
use crate::System;
use std::path::{Path, PathBuf};

/// The settings file inside a config directory.
pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn in_config_dir(config_dir: &Path) -> Self {
        SettingsStore {
            path: crate::paths::app_dir(config_dir).join("settings.toml"),
        }
    }

    /// The default game system, if the file sets one. A missing file means
    /// none.
    pub fn system(&self) -> Result<Option<System>, StoreError> {
        read_system(&read_table(&self.path)?, &self.path)
    }
}
