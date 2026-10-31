//! Where rollin keeps its files. The `rollin` directory under the config
//! directory is built here and nowhere else.

use std::path::{Path, PathBuf};

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

/// The directory holding all of rollin's files: `<config_dir>/rollin`.
pub fn app_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("rollin")
}
