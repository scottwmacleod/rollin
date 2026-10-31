//! Pure pieces of the interactive session: which lines are session commands,
//! and the text they print. The binary owns all I/O.

/// The words only the session understands.
pub const SESSION_WORDS: [&str; 4] = ["help", "quit", "exit", "history"];

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

/// What `help` prints. Kept in one place and short; the README has the rest.
pub fn help_text() -> &'static str {
    "\
Type a formula to roll it (d20+5, 4d6dl1, 6x 4d6dl1, d20 # attack), or a
preset name. Spaces and '#' work as typed; no quotes are needed. Flags such
as --seed 7, -v, -q, --json, --color and --char NAME work on any line and
apply to that line only.

  save <name> <formula> [--global]   save a preset
  presets                            list global presets
  delete <name> [--global]           delete a preset
  import <path> [--force]            import a v1 presets.json
  roll <formula or preset>           roll explicitly
  set <name> <integer>               set a variable on the active character
  unset <name>                       remove a variable
  vars                               list the active character's variables
  characters                         list characters
  char [<name> | new <name> | delete <name>]   show, switch, create, delete
  history                            numbered lines typed so far
  help                               this text
  quit, exit, Ctrl-D                 leave

Tab completes commands, preset and character names, and @variables.
"
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
