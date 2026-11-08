//! The command vocabulary: every word the command parser and the session
//! understand, in one table. Reserved names, completion, `help` and the
//! parser's usage errors all derive from it, so a new command is one row here
//! plus its arm in `parse_command`. A test ties the two together.

/// One command: the words that invoke it and how it describes itself.
pub(crate) struct CommandSpec {
    /// The words that run it (`quit` and `exit` share a row).
    pub words: &'static [&'static str],
    /// The usage line reported when its arguments are wrong. `None` for
    /// commands that take none.
    pub usage: Option<&'static str>,
    /// The left column of its `help` row, when that differs from `usage`.
    pub label: Option<&'static str>,
    /// The right column of its `help` row.
    pub summary: &'static str,
    /// Only the session understands it; one-shot treats the word as unknown.
    pub session_only: bool,
}

const fn command(
    word: &'static [&'static str],
    usage: Option<&'static str>,
    summary: &'static str,
) -> CommandSpec {
    CommandSpec {
        words: word,
        usage,
        label: None,
        summary,
        session_only: false,
    }
}

/// In the order `help` lists them, which is also the order the
/// "it is a command word" message names them.
pub(crate) const COMMANDS: [CommandSpec; 13] = [
    command(
        &["save"],
        Some("save <name> <formula> [--global]"),
        "save a preset",
    ),
    command(
        &["presets"],
        None,
        "list presets (the character's, then global)",
    ),
    command(
        &["delete"],
        Some("delete <name> [--global]"),
        "delete a preset",
    ),
    command(
        &["import"],
        Some("import <path> [--force]"),
        "import a v1 presets.json",
    ),
    CommandSpec {
        label: Some("roll <formula or preset>"),
        ..command(
            &["roll"],
            Some("roll <formula or preset name>"),
            "roll explicitly",
        )
    },
    command(
        &["set"],
        Some("set <name> <integer>"),
        "set a variable on the active character",
    ),
    command(&["unset"], Some("unset <name>"), "remove a variable"),
    command(&["vars"], None, "list the active character's variables"),
    CommandSpec {
        label: Some("char [<name> | new|rename|delete ...]"),
        ..command(
            &["char"],
            Some("char [<name> | new <name> | rename <old> <new> | delete <name>]"),
            "show, switch, create, rename, delete",
        )
    },
    command(&["characters"], None, "list characters"),
    session_command(&["help"], "this text"),
    CommandSpec {
        label: Some("quit, exit, Ctrl-D"),
        ..session_command(&["quit", "exit"], "leave")
    },
    session_command(&["history"], "numbered lines typed so far"),
];

const fn session_command(word: &'static [&'static str], summary: &'static str) -> CommandSpec {
    CommandSpec {
        session_only: true,
        ..command(word, None, summary)
    }
}

/// Every command word, session-only ones included.
pub(crate) fn words() -> impl Iterator<Item = &'static str> {
    COMMANDS.iter().flat_map(|c| c.words.iter().copied())
}

/// The words only the session understands.
pub(crate) fn session_words() -> impl Iterator<Item = &'static str> {
    COMMANDS
        .iter()
        .filter(|c| c.session_only)
        .flat_map(|c| c.words.iter().copied())
}

/// The words the command parser handles.
pub(crate) fn parser_words() -> impl Iterator<Item = &'static str> {
    COMMANDS
        .iter()
        .filter(|c| !c.session_only)
        .flat_map(|c| c.words.iter().copied())
}

/// The usage line of `word`, or the word itself if it has none.
pub(crate) fn usage(word: &'static str) -> &'static str {
    COMMANDS
        .iter()
        .find(|c| c.words.contains(&word))
        .and_then(|c| c.usage)
        .unwrap_or(word)
}

/// One command as the desktop app sees it: what it needs to tell commands
/// from formulas and to show usage as soon as a word is typed.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct CommandInfo {
    /// The words that run it.
    pub words: Vec<&'static str>,
    /// Its usage line; `None` for commands that take no arguments.
    pub usage: Option<&'static str>,
    /// Only the session understands it.
    pub session_only: bool,
}

/// The whole command vocabulary, in `help` order, for front ends that cannot
/// call the crate-private table.
pub fn vocabulary() -> Vec<CommandInfo> {
    COMMANDS
        .iter()
        .map(|c| CommandInfo {
            words: c.words.to_vec(),
            usage: c.usage,
            session_only: c.session_only,
        })
        .collect()
}

/// The command rows of `help`, aligned in two columns.
pub(crate) fn help_rows() -> String {
    const WIDTH: usize = 35;
    let mut out = String::new();
    for c in &COMMANDS {
        let label = c.label.or(c.usage).unwrap_or(c.words[0]);
        let pad = WIDTH.saturating_sub(label.len()).max(2);
        out.push_str(&format!("  {label}{}{}\n", " ".repeat(pad), c.summary));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{parse_command, Command, CommandError};

    fn parse(words: &[&str]) -> Result<Command, CommandError> {
        let words: Vec<String> = words.iter().map(|w| w.to_string()).collect();
        parse_command(&words, &mut || Ok(Vec::new()))
    }

    #[test]
    fn every_parser_word_is_handled_by_the_parser() {
        for word in parser_words() {
            assert!(
                !matches!(
                    parse(&[word]),
                    Ok(Command::Roll(_) | Command::RollPreset(_))
                ),
                "{word} is in the table but parse_command treats it as a formula"
            );
        }
    }

    #[test]
    fn every_session_word_is_refused_by_the_parser() {
        for word in session_words() {
            assert!(
                matches!(parse(&[word]), Err(CommandError::SessionOnly { .. })),
                "{word} is session-only but parse_command accepts it"
            );
        }
    }

    #[test]
    fn every_word_the_parser_matches_is_in_the_table() {
        let source = include_str!("command/parse.rs");
        let mut found = 0;
        for line in source.lines() {
            let Some(start) = line.trim_start().strip_prefix("Some(\"") else {
                continue;
            };
            let word = start.split('"').next().unwrap();
            found += 1;
            assert!(
                parser_words().any(|w| w == word),
                "parse.rs matches {word:?}, which is not in the vocabulary table"
            );
        }
        assert!(found >= 10, "parse.rs scan found only {found} arms");
    }

    #[test]
    fn the_public_vocabulary_mirrors_the_table() {
        let public = vocabulary();
        assert_eq!(public.len(), COMMANDS.len());
        let words: Vec<&str> = public
            .iter()
            .flat_map(|c| c.words.iter().copied())
            .collect();
        assert_eq!(words, words_in_table());
        let quit = public.iter().find(|c| c.words.contains(&"exit")).unwrap();
        assert!(quit.session_only && quit.usage.is_none());
    }

    fn words_in_table() -> Vec<&'static str> {
        words().collect()
    }

    #[test]
    fn usage_strings_start_with_their_word() {
        for c in &COMMANDS {
            if let Some(usage) = c.usage {
                assert!(usage.starts_with(c.words[0]), "{usage}");
            }
        }
    }
}
