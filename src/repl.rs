//! The interactive session: a line editor over a terminal, or a plain loop
//! over piped stdin. Both run each line through [`handle_line`].

use crate::run_line;
use clap::Parser;
use rand_chacha::ChaCha8Rng;
use rollin::{format_history, help_text, session_command, Context, SessionCommand};
use rustyline::completion::Completer;
use rustyline::highlight::Highlighter;
use rustyline::hint::Hinter;
use rustyline::history::DefaultHistory;
use rustyline::validate::Validator;
use rustyline::{CompletionType, Config, Editor, Helper};
use std::io::{BufRead, IsTerminal};
use std::path::PathBuf;
use std::process::ExitCode;

/// How many lines the history file keeps.
const HISTORY_SIZE: usize = 1000;

/// Runs the session until `quit`, Ctrl-D or end of input. Exit code 0.
pub fn session(rng: &mut ChaCha8Rng) -> ExitCode {
    if std::io::stdin().is_terminal() {
        if let Err(e) = interactive(rng) {
            eprintln!("error: cannot start the line editor: {e}");
            return ExitCode::FAILURE;
        }
    } else {
        piped(rng);
    }
    ExitCode::SUCCESS
}

/// Runs one session line. Returns `true` when the session should end.
fn handle_line(line: &str, rng: &mut ChaCha8Rng, history: &dyn Fn() -> Vec<String>) -> bool {
    let words: Vec<&str> = line.split_whitespace().collect();
    match session_command(&words) {
        Some(SessionCommand::Quit) => return true,
        Some(SessionCommand::Help) => print!("{}", help_text()),
        Some(SessionCommand::History) => {
            print!("{}", format_history(history().iter().map(String::as_str)));
        }
        None => match crate::Args::try_parse_from(std::iter::once("rollin").chain(words)) {
            Ok(args) if args.words.is_empty() => {}
            Ok(args) => {
                run_line(&args, rng);
            }
            // Print the clap error (or --help text) and carry on.
            Err(e) => {
                let _ = e.print();
            }
        },
    }
    false
}

/// Non-interactive: no prompt, banner or history file.
fn piped(rng: &mut ChaCha8Rng) {
    let mut history: Vec<String> = Vec::new();
    for line in std::io::stdin().lock().lines().map_while(Result::ok) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if history.last().map(String::as_str) != Some(line) {
            history.push(line.to_string());
        }
        if handle_line(line, rng, &|| history.clone()) {
            break;
        }
    }
}

/// Tab completion, fed from the store afresh on every request.
struct Completions {
    config_dir: Option<PathBuf>,
}

impl Completer for Completions {
    type Candidate = String;

    fn complete(
        &self,
        line: &str,
        pos: usize,
        _: &rustyline::Context<'_>,
    ) -> rustyline::Result<(usize, Vec<String>)> {
        let data = Context::new(self.config_dir.clone()).completion_data();
        let completion = rollin::complete(line, pos, &data);
        Ok((completion.start, completion.candidates))
    }
}

impl Hinter for Completions {
    type Hint = String;
}
impl Highlighter for Completions {}
impl Validator for Completions {}
impl Helper for Completions {}

fn interactive(rng: &mut ChaCha8Rng) -> rustyline::Result<()> {
    let config_dir = crate::config_dir();
    let config = Config::builder()
        .max_history_size(HISTORY_SIZE)?
        .history_ignore_dups(true)?
        .completion_type(CompletionType::List)
        .build();
    let mut editor: Editor<Completions, DefaultHistory> = Editor::with_config(config)?;
    editor.set_helper(Some(Completions {
        config_dir: config_dir.clone(),
    }));
    let history_path = config_dir
        .as_ref()
        .map(|d| d.join("rollin").join("history"));
    if let Some(path) = history_path.as_ref().filter(|p| p.exists()) {
        if let Err(e) = editor.load_history(path) {
            eprintln!("warning: cannot read history {}: {e}", path.display());
        }
    }
    println!(
        "rollin {} — type 'help' for commands, 'quit' to exit",
        rollin::version()
    );
    let mut warned = false;
    loop {
        let prompt = Context::new(config_dir.clone()).prompt();
        match editor.readline(&prompt) {
            Ok(line) => {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                // Leaving is not worth recalling; the line before it is.
                let leaving = session_command(&line.split_whitespace().collect::<Vec<_>>())
                    == Some(SessionCommand::Quit);
                if !leaving && matches!(editor.add_history_entry(line), Ok(true)) && !warned {
                    if let Some(path) = &history_path {
                        warned = !save_history(&mut editor, path);
                    }
                }
                let entries = |h: &DefaultHistory| h.iter().cloned().collect::<Vec<_>>();
                if handle_line(line, rng, &|| entries(editor.history())) {
                    break;
                }
            }
            Err(rustyline::error::ReadlineError::Interrupted) => {}
            Err(rustyline::error::ReadlineError::Eof) => {
                println!();
                break;
            }
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

/// Appends new entries to the history file, creating its directory. A
/// failure is a warning, once per session. Returns whether it worked.
fn save_history(editor: &mut Editor<Completions, DefaultHistory>, path: &std::path::Path) -> bool {
    let saved = path
        .parent()
        .map_or(Ok(()), std::fs::create_dir_all)
        .map_err(|e| e.to_string())
        .and_then(|()| editor.append_history(path).map_err(|e| e.to_string()));
    if let Err(e) = &saved {
        eprintln!("warning: cannot write history {}: {e}", path.display());
    }
    saved.is_ok()
}
