//! The interactive session, driven non-interactively: lines piped on stdin.
//! (Terminal behaviour is covered by the three pty tests in `tests/pty.rs`.)

mod common;
use common::Cli;

#[test]
fn a_piped_line_runs_like_the_one_shot_command() {
    let one_shot = Cli::new().run(&["d20", "--seed", "1"]);
    let session = Cli::new().run_stdin(&[], "d20 --seed 1\n");
    assert_eq!(session.code, 0);
    assert_eq!(session.stdout, one_shot.stdout);
    assert_eq!(session.stdout, "d20  [9]  →  9\n");
    assert_eq!(session.stderr, "");
}
