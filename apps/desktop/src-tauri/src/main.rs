// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The Tauri commands. Each one locks the session and calls
//! `rollin-desktop-core`; the logic and its tests live there.

use rollin_desktop_core::{About, Completions, Execution, Failure, Session, State, SystemScope};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::menu::{Menu, MenuItem};
use tauri::{AppHandle, Emitter, Runtime};

/// The menu item that opens the About view, and the event it sends the page.
const ABOUT_ID: &str = "about";
const ABOUT_EVENT: &str = "about:open";

/// The one session for this app run (ADR-0007: one RNG in managed state).
struct AppSession(Mutex<Session>);

impl AppSession {
    fn lock(&self) -> MutexGuard<'_, Session> {
        // A panic mid-command leaves the session usable: it holds no invariant.
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[tauri::command]
fn execute(session: tauri::State<'_, AppSession>, line: String) -> Execution {
    session.lock().execute(&line)
}

#[tauri::command]
fn complete(session: tauri::State<'_, AppSession>, line: String, pos: usize) -> Completions {
    session.lock().complete(&line, pos)
}

/// The lines typed this session, for the formula box's ↑ and ↓.
#[tauri::command]
fn history(session: tauri::State<'_, AppSession>) -> Vec<String> {
    session.lock().history().to_vec()
}

#[tauri::command]
fn check(session: tauri::State<'_, AppSession>, formula: String) -> Result<(), Failure> {
    session.lock().check(&formula)
}

#[tauri::command]
fn sample(
    session: tauri::State<'_, AppSession>,
    formula: String,
) -> Result<Vec<rollin::RollResult>, Failure> {
    session.lock().sample(&formula)
}

#[tauri::command]
fn state(session: tauri::State<'_, AppSession>) -> Result<State, Failure> {
    session.lock().state()
}

#[tauri::command]
fn set_system(
    session: tauri::State<'_, AppSession>,
    scope: SystemScope,
    character: Option<String>,
    system: Option<String>,
) -> Result<(), Failure> {
    session
        .lock()
        .set_system(scope, character.as_deref(), system.as_deref())
}

#[tauri::command]
fn set_seed(session: tauri::State<'_, AppSession>, seed: Option<u64>) -> Option<u64> {
    let mut session = session.lock();
    session.seed(seed);
    session.current_seed()
}

/// The command words and their usage lines, from the library's table.
#[tauri::command]
fn vocabulary() -> Vec<rollin::CommandInfo> {
    rollin::vocabulary()
}

#[tauri::command]
fn about(app: AppHandle) -> About {
    rollin_desktop_core::about(&app.package_info().version.to_string())
}

/// The `.app` bundle that `exe` (`X.app/Contents/MacOS/bin`) runs from.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn bundle_of(exe: &Path) -> Option<PathBuf> {
    let bundle = exe.ancestors().nth(3)?;
    (bundle.extension()? == "app" && exe.parent()?.file_name()? == "MacOS")
        .then(|| bundle.to_path_buf())
}

/// Restarts into the installed update. On macOS the stock restart execs the
/// binary directly, which the Dock shows as a second Rollin icon; opening the
/// bundle through LaunchServices once this process has exited reuses the
/// Dock's own icon.
#[tauri::command]
fn relaunch_app(app: AppHandle) {
    #[cfg(target_os = "macos")]
    if let Some(bundle) = std::env::current_exe().ok().as_deref().and_then(bundle_of) {
        let script =
            r#"while kill -0 "$1" 2>/dev/null; do sleep 0.1; done; exec /usr/bin/open "$2""#;
        let spawned = std::process::Command::new("/bin/sh")
            .args(["-c", script, "sh", &std::process::id().to_string()])
            .arg(&bundle)
            .spawn();
        if spawned.is_ok() {
            app.exit(0);
            return;
        }
    }
    app.restart();
}

/// The stock menu with our About item in place of the native About panel.
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let item = MenuItem::with_id(app, ABOUT_ID, "About Rollin", true, Some("CmdOrCtrl+Alt+A"))?;
    #[cfg(target_os = "macos")]
    {
        use tauri::menu::MenuItemKind;
        // The app menu is first; its first entry is the native About item.
        if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
            if let Some(stock) = app_menu.items()?.into_iter().next() {
                app_menu.remove(&stock)?;
            }
            app_menu.prepend(&item)?;
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::menu::Submenu;
        menu.append(&Submenu::with_items(app, "Rollin", true, &[&item])?)?;
    }
    Ok(menu)
}

/// `%APPDATA%` on Windows, else `$XDG_CONFIG_HOME` if absolute, else `$HOME/.config`.
fn config_dir() -> Option<PathBuf> {
    rollin::config_dir_from_env()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // The updater checks and installs from the page (src/updater); its
        // endpoint and public key are in tauri.conf.json.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .menu(build_menu)
        .on_menu_event(|app, event| {
            if event.id() == ABOUT_ID {
                // The view is in the page; a failed emit leaves nothing to show.
                let _ = app.emit(ABOUT_EVENT, ());
            }
        })
        .manage(AppSession(Mutex::new(Session::new(config_dir()))))
        .invoke_handler(tauri::generate_handler![
            execute,
            complete,
            history,
            check,
            sample,
            state,
            set_seed,
            set_system,
            vocabulary,
            about,
            relaunch_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running the rollin desktop app");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_bundle_around_the_binary() {
        let exe = Path::new("/Applications/Rollin.app/Contents/MacOS/rollin-desktop");
        assert_eq!(
            bundle_of(exe),
            Some(PathBuf::from("/Applications/Rollin.app"))
        );
    }

    #[test]
    fn a_bare_binary_has_no_bundle() {
        assert_eq!(
            bundle_of(Path::new("/repo/target/debug/rollin-desktop")),
            None
        );
        assert_eq!(bundle_of(Path::new("/x.app/y/z/bin")), None);
    }
}
