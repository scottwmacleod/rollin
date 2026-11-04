// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The Tauri commands. Each one locks the session and calls
//! `rollin-desktop-core`; the logic and its tests live there.

use rollin_desktop_core::{Completions, Execution, Failure, Session, State};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

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

#[tauri::command]
fn check(session: tauri::State<'_, AppSession>, formula: String) -> Result<(), Failure> {
    session.lock().check(&formula)
}

#[tauri::command]
fn state(session: tauri::State<'_, AppSession>) -> Result<State, Failure> {
    session.lock().state()
}

#[tauri::command]
fn set_seed(session: tauri::State<'_, AppSession>, seed: Option<u64>) -> Option<u64> {
    let mut session = session.lock();
    session.seed(seed);
    session.current_seed()
}

/// `$XDG_CONFIG_HOME` if absolute, else `$HOME/.config`: the CLI's rule.
fn config_dir() -> Option<PathBuf> {
    let xdg = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from);
    let home = std::env::var_os("HOME").map(PathBuf::from);
    rollin::config_dir(xdg.as_deref(), home.as_deref())
}

fn main() {
    tauri::Builder::default()
        .manage(AppSession(Mutex::new(Session::new(config_dir()))))
        .invoke_handler(tauri::generate_handler![
            execute, complete, check, state, set_seed
        ])
        .run(tauri::generate_context!())
        .expect("error while running the rollin desktop app");
}
