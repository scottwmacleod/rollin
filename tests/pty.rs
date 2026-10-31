//! Smoke tests for the interactive wiring, run in a real pseudo-terminal:
//! the prompt, tab completion and the persistent history file. Everything
//! else about the session is tested through piped stdin in `tests/session.rs`.

mod common;

use common::Cli;
use rexpect::process::WaitStatus;
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

#[test]
fn ctrl_c_discards_the_line_being_typed_and_the_session_continues() {
    let cli = Cli::new();
    let result = cli
        .run(&["d20", "--seed", "5", "--json"])
        .stdout
        .trim_end()
        .to_string();
    let mut p = start(&cli);
    p.exp_string("rollin> ").expect("prompt");
    // If Ctrl-C did not clear this, it would prefix the next line and fail.
    send(&mut p, "garbage not a roll");
    send(&mut p, "\x03");
    p.exp_string("rollin> ")
        .expect("a fresh prompt after Ctrl-C");
    p.send_line("d20 --seed 5 --json").unwrap();
    p.exp_string(&result)
        .expect("the next line ran on its own, with the garbage gone");
    p.send_line("quit").unwrap();
    p.exp_eof().expect("exits on quit");
}

#[test]
fn ctrl_d_at_an_empty_prompt_exits_cleanly_with_status_zero() {
    let cli = Cli::new();
    let mut p = start(&cli);
    p.exp_string("rollin> ").expect("prompt");
    send(&mut p, "\x04");
    p.exp_eof().expect("exits on Ctrl-D");
    match p.process().wait().expect("reap rollin") {
        WaitStatus::Exited(_, code) => assert_eq!(code, 0, "exit status"),
        other => panic!("rollin did not exit normally: {other:?}"),
    }
}

#[test]
fn an_unwritable_history_file_warns_once_and_the_session_keeps_working() {
    use std::os::unix::fs::PermissionsExt;
    let cli = Cli::new();
    let dir = cli.config_dir().join("rollin");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
    // Root ignores permission bits, so there is nothing to test.
    if std::fs::write(dir.join(".probe"), "").is_ok() {
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        eprintln!("skipped: permissions are not enforced for this user");
        return;
    }
    let roll = |seed: u32| format!("d20 --seed {seed} --json");
    let result = |seed: u32| {
        cli.run(&["d20", "--seed", &seed.to_string(), "--json"])
            .stdout
            .trim_end()
            .to_string()
    };

    let mut p = start(&cli);
    p.exp_string("rollin> ").expect("prompt");
    p.send_line(&roll(1)).unwrap();
    p.exp_string("warning: cannot write history")
        .expect("the history failure is reported");
    p.exp_string(&result(1)).expect("the first roll still ran");
    p.exp_string("rollin> ").expect("prompt");
    p.send_line(&roll(2)).unwrap();
    let before_second = p.exp_string(&result(2)).expect("a later roll still runs");
    assert!(
        !before_second.contains("warning"),
        "the warning must appear once per session: {before_second:?}"
    );
    p.send_line("quit").unwrap();
    let rest = p.exp_eof().expect("exits on quit");
    let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755));
    assert!(!rest.contains("warning"), "{rest:?}");
}
