//! Pure pieces of the interactive session: which lines are session commands,
//! and the text they print. The binary owns all I/O.

/// A command only the session understands (one-shot treats these words as
/// ordinary, unknown words).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionCommand {
    Quit,
}

/// The session command a line is, if any: exactly one word, in any case.
pub fn session_command(words: &[&str]) -> Option<SessionCommand> {
    match words {
        [word] => match word.to_lowercase().as_str() {
            "quit" | "exit" => Some(SessionCommand::Quit),
            _ => None,
        },
        _ => None,
    }
}
