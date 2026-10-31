//! Smoke tests for the interactive wiring, run in a real pseudo-terminal:
//! the prompt, tab completion and the persistent history file. Everything
//! else about the session is tested through piped stdin in `tests/session.rs`.

mod common;

use common::Cli;
use rexpect::session::{spawn_command, PtySession};
use std::path::Path;
use std::process::Command;

/// Generous: CI machines can be slow, and a timeout is only ever a failure.
const TIMEOUT_MS: u64 = 10_000;

fn start(config_dir: &Path) -> PtySession {
    let mut command = Command::new(env!("CARGO_BIN_EXE_rollin"));
    command
        .env("XDG_CONFIG_HOME", config_dir)
        .env("TERM", "xterm")
        .env_remove("NO_COLOR");
    spawn_command(command, Some(TIMEOUT_MS)).expect("spawn rollin in a pty")
}

#[test]
fn the_session_starts_shows_a_prompt_and_quits() {
    let cli = Cli::new();
    let mut p = start(cli.config_dir());
    p.exp_string("type 'help' for commands, 'quit' to exit")
        .expect("banner");
    p.exp_string("rollin> ").expect("prompt");
    p.send_line("quit").unwrap();
    p.exp_eof().expect("exits on quit");
}
