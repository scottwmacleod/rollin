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

/// Pipes `lines` through one session and runs each line one-shot (words split
/// on whitespace) in a second, identical config dir; the session's stdout and
/// stderr must equal the concatenated one-shot streams.
#[track_caller]
fn assert_parity(lines: &[&str]) {
    let (session_cli, one_shot_cli) = (Cli::new(), Cli::new());
    let session = session_cli.run_stdin(&[], &(lines.join("\n") + "\n"));
    let (mut stdout, mut stderr) = (String::new(), String::new());
    for line in lines {
        let words: Vec<&str> = line.split_whitespace().collect();
        let run = one_shot_cli.run(&words);
        stdout += &run.stdout;
        stderr += &run.stderr;
    }
    assert_eq!(session.code, 0, "{session:?}");
    assert_eq!(session.stdout, stdout, "stdout for {lines:?}");
    assert_eq!(session.stderr, stderr, "stderr for {lines:?}");
}

#[test]
fn a_command_line_parse_error_is_printed_and_the_session_continues() {
    assert_parity(&["--bogus", "d20 --seed 1"]);
}

#[test]
fn every_kind_of_line_matches_the_one_shot_output_byte_for_byte() {
    assert_parity(&[
        // rolls and output modes
        "4d6dl1 --seed 3",
        "-v 4d6dl1 --seed 3",
        "-q 2d6+3 --seed 7",
        "--json 2d6+3 --seed 7",
        "--color always d20 --seed 2",
        "3x d20+8 # attack, d10+5 # damage --seed 1",
        "6d10>=8f1 --seed 2",
        // flag-only and malformed command lines
        "--json",
        "--seed",
        "--help",
        "-q -v d20",
        "--color puce d20",
        // formula errors with spans
        "d20+",
        "d20 / (3-3)",
        "6d10>=8 + 3",
        // presets
        "presets",
        "save atk d20+8",
        "save sneak d20+5, 2d6",
        "presets",
        "atk --seed 3",
        "roll sneak --seed 3 -q",
        "save --global house d6",
        "delete atk",
        "delete atk",
        "atkk",
        "save help d6",
        // characters and variables
        "set str 3",
        "d20+@str --seed 1",
        "char new grog",
        "set str 5",
        "set dex 2",
        "vars",
        "characters",
        "--char default vars",
        "d20+@dx",
        "--char default d20+@dex",
        "--char gorg d20",
        "d20+@str --seed 1",
        "save atk d20+@str",
        "atk --seed 3",
        "char default",
        "char gorg",
        "char delete grog",
        "unset str",
        "unset str",
        "set sides 1",
        "d@sides",
        // import with the hidden flags
        "import /nonexistent.json",
        "import /nonexistent.json --force",
    ]);
}

#[test]
fn a_char_override_applies_to_its_own_line_only() {
    assert_parity(&["char new grog", "set str 5", "--char default vars", "vars"]);
}

#[test]
fn quit_and_exit_end_the_session_in_any_case() {
    for word in ["quit", "exit", "QUIT", "Exit"] {
        let run = Cli::new().run_stdin(&[], &format!("d20 --seed 1\n{word}\nd20 --seed 1\n"));
        assert_eq!(run.code, 0, "{word}: {run:?}");
        assert_eq!(run.stdout, "d20  [9]  →  9\n", "{word}");
        assert_eq!(run.stderr, "", "{word}");
    }
}
