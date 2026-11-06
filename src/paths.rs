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

/// The config directory on Windows: an absolute, non-empty `%APPDATA%`
/// (ADR-0004). Windows has no `HOME` or XDG variables to fall back on.
pub fn windows_config_dir(appdata: Option<&Path>) -> Option<PathBuf> {
    appdata.filter(|a| a.is_absolute()).map(Path::to_path_buf)
}

/// The config directory for this process: `%APPDATA%` on Windows, otherwise
/// the XDG rule from the environment.
pub fn config_dir_from_env() -> Option<PathBuf> {
    let var = |name| std::env::var_os(name).map(PathBuf::from);
    if cfg!(windows) {
        windows_config_dir(var("APPDATA").as_deref())
    } else {
        config_dir(var("XDG_CONFIG_HOME").as_deref(), var("HOME").as_deref())
    }
}

/// The directory holding all of rollin's files: `<config_dir>/rollin`.
pub fn app_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("rollin")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_uses_an_absolute_appdata() {
        let appdata = if cfg!(windows) {
            r"C:\Users\a\AppData\Roaming"
        } else {
            "/a/Roaming"
        };
        assert_eq!(
            windows_config_dir(Some(Path::new(appdata))),
            Some(PathBuf::from(appdata))
        );
    }

    #[test]
    fn windows_ignores_missing_or_relative_appdata() {
        assert_eq!(windows_config_dir(None), None);
        assert_eq!(windows_config_dir(Some(Path::new("Roaming"))), None);
        assert_eq!(windows_config_dir(Some(Path::new(""))), None);
    }
}
