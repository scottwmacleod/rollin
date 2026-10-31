//! CLI-seam test helper: runs the compiled `rollin` binary as a process.
//!
//! Every [`Cli`] owns a fresh temporary `XDG_CONFIG_HOME` and `HOME` (also the
//! working directory), so tests never touch the real user config or the
//! checkout and never see each other's state.

#![allow(dead_code)] // each test crate uses a different subset

use assert_cmd::Command;
use tempfile::TempDir;

/// What a `rollin` invocation produced.
#[derive(Debug, Clone)]
pub struct Run {
    pub stdout: String,
    pub stderr: String,
    /// Exit code (`-1` if terminated by a signal).
    pub code: i32,
}

impl Run {
    pub fn success(&self) -> bool {
        self.code == 0
    }

    /// Panics with full output unless the run exited 0.
    #[track_caller]
    pub fn assert_success(&self) -> &Self {
        assert!(self.success(), "expected success, got: {self:#?}");
        self
    }

    /// Parses stdout as JSON (for `--json` runs).
    #[track_caller]
    pub fn json(&self) -> serde_json::Value {
        serde_json::from_str(&self.stdout)
            .unwrap_or_else(|e| panic!("stdout is not JSON ({e}): {self:#?}"))
    }
}

/// A sandboxed `rollin` command runner with its own config directory.
pub struct Cli {
    config_dir: TempDir,
    home: TempDir,
}

impl Cli {
    pub fn new() -> Self {
        Cli {
            config_dir: TempDir::new().expect("create temp config dir"),
            home: TempDir::new().expect("create temp home"),
        }
    }

    /// The sandbox `HOME`.
    pub fn home_dir(&self) -> &std::path::Path {
        self.home.path()
    }

    pub fn config_dir(&self) -> &std::path::Path {
        self.config_dir.path()
    }

    /// A `rollin` command sandboxed to this `Cli`: `HOME` and the working
    /// directory are a temp dir, and `XDG_CONFIG_HOME` is the temp config
    /// dir. Every spawn in the test suite must start from here, so nothing
    /// can read or write the real config or the repo checkout.
    pub fn command(&self) -> Command {
        Command::from_std(self.std_command())
    }

    /// [`Cli::command`] as a plain `std` command (for the pty tests).
    pub fn std_command(&self) -> std::process::Command {
        let mut cmd = std::process::Command::new(env!("CARGO_BIN_EXE_rollin"));
        cmd.env("HOME", self.home.path())
            .env("XDG_CONFIG_HOME", self.config_dir.path())
            .current_dir(self.home.path());
        cmd
    }

    /// Runs `rollin` with `args`, capturing output; never panics on failure exit.
    pub fn run(&self, args: &[&str]) -> Run {
        self.run_stdin(args, "")
    }

    /// Like [`Cli::run`], but with `XDG_CONFIG_HOME` unset so `rollin` falls
    /// back to `$HOME/.config`. Used to prove HOME is sandboxed too.
    pub fn run_without_xdg(&self, args: &[&str]) -> Run {
        let out = self
            .command()
            .env_remove("XDG_CONFIG_HOME")
            .args(args)
            .output()
            .expect("spawn rollin");
        Run {
            stdout: String::from_utf8(out.stdout).expect("utf-8 stdout"),
            stderr: String::from_utf8(out.stderr).expect("utf-8 stderr"),
            code: out.status.code().unwrap_or(-1),
        }
    }

    /// Like [`Cli::run`], with `stdin` piped in (so not a terminal).
    pub fn run_stdin(&self, args: &[&str], stdin: &str) -> Run {
        let out = self
            .command()
            .args(args)
            .write_stdin(stdin)
            .output()
            .expect("spawn rollin");
        Run {
            stdout: String::from_utf8(out.stdout).expect("utf-8 stdout"),
            stderr: String::from_utf8(out.stderr).expect("utf-8 stderr"),
            code: out.status.code().unwrap_or(-1),
        }
    }

    /// Convenience: `rollin <formula> --seed <seed> --json`, parsed.
    #[track_caller]
    pub fn roll_json(&self, formula: &str, seed: u64) -> serde_json::Value {
        let seed = seed.to_string();
        let run = self.run(&[formula, "--seed", &seed, "--json"]);
        run.assert_success();
        run.json()
    }
}

impl Default for Cli {
    fn default() -> Self {
        Self::new()
    }
}

/// Every die in a roll's result tree, in roll order (`--json` shape).
pub fn flat_dice(node: &serde_json::Value) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    collect_dice(node, &mut out);
    out
}

fn collect_dice(node: &serde_json::Value, out: &mut Vec<serde_json::Value>) {
    match node["type"].as_str() {
        Some("dice") => out.extend(node["dice"].as_array().expect("dice array").clone()),
        Some("group") => collect_dice(&node["inner"], out),
        Some("neg") => collect_dice(&node["operand"], out),
        Some("chain") => {
            collect_dice(&node["first"], out);
            for link in node["rest"].as_array().expect("rest array") {
                collect_dice(&link["node"], out);
            }
        }
        _ => {}
    }
}
