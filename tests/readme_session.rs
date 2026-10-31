//! The session transcript in the README is real output. This replays its
//! typed lines through the binary (piped, so no prompts or banner) and fails
//! when the documented output drifts.

mod common;

use common::Cli;
use std::process::Stdio;

/// The first fenced block under `## Session` in the README.
fn transcript() -> Vec<String> {
    let readme = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/README.md"))
        .expect("read README.md");
    let after = readme
        .split_once("\n## Session\n")
        .expect("README has a '## Session' section")
        .1;
    let block = after
        .split_once("\n```\n")
        .expect("the section opens a code block")
        .1;
    block
        .split_once("\n```\n")
        .expect("the code block closes")
        .0
        .lines()
        .map(str::to_string)
        .collect()
}

/// `Some(typed)` for a prompt line (`rollin> x`, `rollin[grog]> x`).
fn typed(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("rollin")?;
    let rest = match rest.strip_prefix('[') {
        Some(named) => named.split_once(']')?.1,
        None => rest,
    };
    rest.strip_prefix("> ")
}

#[test]
fn the_readme_session_transcript_is_what_the_binary_prints() {
    let mut inputs = Vec::new();
    let mut expected = String::new();
    for line in transcript() {
        if let Some(input) = typed(&line) {
            inputs.push(input.to_string());
        } else if line == "$ rollin" || line.starts_with("rollin ") {
            // The command itself and the banner (terminal only).
        } else {
            expected += &format!("{line}\n");
        }
    }
    assert!(inputs.len() > 5, "transcript not parsed: {inputs:?}");

    // stdout and stderr share one pipe, so errors land where they print.
    let cli = Cli::new();
    let mut shell = std::process::Command::new("sh");
    shell
        .args(["-c", "exec \"$0\" 2>&1"])
        .arg(cli.std_command().get_program())
        .envs(
            cli.std_command()
                .get_envs()
                .filter_map(|(k, v)| Some((k, v?))),
        )
        .current_dir(cli.home_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    let mut child = shell.spawn().expect("spawn rollin");
    {
        use std::io::Write;
        let mut stdin = child.stdin.take().unwrap();
        stdin
            .write_all((inputs.join("\n") + "\n").as_bytes())
            .unwrap();
    }
    let out = child.wait_with_output().expect("rollin finishes");
    assert!(out.status.success());
    assert_eq!(String::from_utf8(out.stdout).unwrap(), expected);
}
