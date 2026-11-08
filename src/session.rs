//! Pure pieces of the interactive session: which lines are session commands,
//! and the text they print. The front ends own all I/O.

use crate::line::LinePolicy;

/// A command only the session understands (one-shot treats these words as
/// ordinary, unknown words).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionCommand {
    Quit,
    Help,
    History,
}

/// The session command a line is, if any: exactly one word, in any case.
pub fn session_command(words: &[&str]) -> Option<SessionCommand> {
    match words {
        [word] => match word.to_lowercase().as_str() {
            "quit" | "exit" => Some(SessionCommand::Quit),
            "help" => Some(SessionCommand::Help),
            "history" => Some(SessionCommand::History),
            _ => None,
        },
        _ => None,
    }
}

/// What `help` prints for a front end. Kept in one place and short; the README
/// has the rest. It lists only the per-line flags `policy` accepts.
pub fn help_text(policy: LinePolicy) -> String {
    let flags = if policy == LinePolicy::REPL {
        "Flags such\nas --seed 7, -q, --json, --color and --char NAME work on any line and\napply to that line only."
    } else {
        "The flag\n--char NAME works on any line and applies to that line only."
    };
    format!(
        "\
Type a formula to roll it (d20+5, 4d6dl1, 6x 4d6dl1, d20 # attack), or a
preset name. Spaces and '#' work as typed; no quotes are needed. {flags}

{}
Tab completes commands, preset and character names, and @variables.
",
        crate::vocab::help_rows()
    )
}

/// The `history` listing: one numbered line per entry, oldest first, numbers
/// right-aligned.
pub fn format_history<'a>(entries: impl ExactSizeIterator<Item = &'a str>) -> String {
    let width = entries.len().to_string().len();
    entries
        .enumerate()
        .map(|(i, line)| format!("{:>width$}  {line}\n", i + 1))
        .collect()
}
