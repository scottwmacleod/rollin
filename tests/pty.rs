//! Smoke tests for the interactive wiring, run in a real pseudo-terminal:
//! the prompt, tab completion and the persistent history file. Everything
//! else about the session is tested through piped stdin in `tests/session.rs`.

mod common;

use common::Cli;
use rexpect::session::{spawn_command, PtySession};

/// Generous: CI machines can be slow, and a timeout is only ever a failure.
const TIMEOUT_MS: u64 = 10_000;

fn start(cli: &Cli) -> PtySession {
    let mut command = cli.std_command();
    command.env("TERM", "xterm").env_remove("NO_COLOR");
    spawn_command(command, Some(TIMEOUT_MS)).expect("spawn rollin in a pty")
}

/// Sends keystrokes right away (`send` alone leaves them buffered).
fn send(p: &mut PtySession, keys: &str) {
    p.send(keys).expect("send keys");
    p.flush().expect("flush keys");
}

#[test]
fn the_session_starts_shows_a_prompt_and_quits() {
    let cli = Cli::new();
    let mut p = start(&cli);
    p.exp_string("type 'help' for commands, 'quit' to exit")
        .expect("banner");
    p.exp_string("rollin> ").expect("prompt");
    p.send_line("quit").unwrap();
    p.exp_eof().expect("exits on quit");
}

#[test]
fn tab_completes_a_preset_name_and_the_line_runs() {
    let cli = Cli::new();
    cli.run(&["save", "sneak", "d20+5"]).assert_success();
    let mut p = start(&cli);
    p.exp_string("rollin> ").expect("prompt");
    // "sn" is a typo for a preset only if Tab did not complete it.
    send(&mut p, "sn");
    send(&mut p, "\t");
    p.exp_string("sneak").expect("Tab completed the name");
    send(&mut p, "\r");
    p.exp_string("(preset 'sneak': d20+5)")
        .expect("the completed line rolled the preset");
    p.send_line("quit").unwrap();
    p.exp_eof().expect("exits on quit");
}

#[test]
fn history_persists_across_restarts() {
    let cli = Cli::new();
    // --json output is plain ASCII on one line, easy to match in a pty (which
    // reads bytes as Latin-1, so the arrow in the default output would not).
    let line = "d20 --seed 5 --json";
    let result = cli
        .run(&["d20", "--seed", "5", "--json"])
        .stdout
        .trim_end()
        .to_string();

    let mut first = start(&cli);
    first.exp_string("rollin> ").expect("prompt");
    first.send_line(line).unwrap();
    first.exp_string(&result).expect("first roll");
    first.send_line("quit").unwrap();
    first.exp_eof().expect("exits on quit");

    let mut second = start(&cli);
    second.exp_string("rollin> ").expect("prompt");
    send(&mut second, "\x1b[A"); // Up arrow: recall the previous line
    send(&mut second, "\r");
    second
        .exp_string(&result)
        .expect("the recalled line rolled again");
    second.send_line("quit").unwrap();
    second.exp_eof().expect("exits on quit");
}
