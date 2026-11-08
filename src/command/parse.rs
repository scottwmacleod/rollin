use super::{edit_distance, Command, CommandError};
use crate::name::{is_name_shaped, normalise, Name};
use crate::Error;
use std::path::PathBuf;

/// Parses a line of words into a command. `preset_names` lists the saved
/// preset names; it is only called when a lone word might be a preset name.
pub fn parse_command(
    words: &[String],
    preset_names: &mut dyn FnMut() -> Result<Vec<String>, CommandError>,
) -> Result<Command, CommandError> {
    let first = words.first().map(|w| w.to_lowercase());
    let rest = words.get(1..).unwrap_or_default();
    match first.as_deref() {
        Some("save") => {
            let (rest, global) = take_flag(rest, "--global");
            match rest.as_slice() {
                [name, formula @ ..] if !formula.is_empty() => Ok(Command::Save {
                    name: name.clone(),
                    formula: formula.join(" "),
                    global,
                }),
                _ => Err(CommandError::Usage {
                    usage: usage("save"),
                }),
            }
        }
        Some("roll") if rest.is_empty() => Err(CommandError::Usage {
            usage: usage("roll"),
        }),
        Some("roll") => roll_or_preset(rest, preset_names),
        Some("characters") => Ok(Command::Characters),
        Some("char") => parse_char(rest),
        Some("unset") => match rest {
            [name] => Ok(Command::Unset {
                name: normalise(name),
            }),
            _ => Err(CommandError::Usage {
                usage: usage("unset"),
            }),
        },
        Some("vars") => Ok(Command::Vars),
        Some("set") => match rest {
            [name, value] => Ok(Command::Set {
                name: Name::variable(name)
                    .ok_or_else(|| CommandError::InvalidVarName { name: name.clone() })?
                    .into_string(),
                value: value.parse().map_err(|_| CommandError::NotAnInteger {
                    value: value.clone(),
                })?,
            }),
            _ => Err(CommandError::Usage {
                usage: usage("set"),
            }),
        },
        Some("presets") => Ok(Command::Presets),
        Some("import") => parse_import(rest),
        Some("delete") => {
            let (rest, global) = take_flag(rest, "--global");
            match rest.as_slice() {
                [name] => Ok(Command::Delete {
                    name: name.clone(),
                    global,
                }),
                _ => Err(CommandError::Usage {
                    usage: usage("delete"),
                }),
            }
        }
        _ => roll_or_preset(words, preset_names),
    }
}

/// `char` and its subcommands, which the vocabulary table names.
fn parse_char(rest: &[String]) -> Result<Command, CommandError> {
    let sub = rest
        .first()
        .and_then(|w| crate::vocab::subcommand("char", w));
    match (sub, rest) {
        (None, []) => Ok(Command::CharShow),
        (None, [name]) => Ok(Command::CharSwitch(
            Name::shaped(name).map_err(CommandError::InvalidCharName)?,
        )),
        (Some("delete"), [_, name]) => Ok(Command::CharDelete(
            Name::shaped(name).map_err(CommandError::InvalidCharName)?,
        )),
        (Some("rename"), [_, from, to]) => Ok(Command::CharRename {
            from: Name::shaped(from).map_err(CommandError::InvalidCharName)?,
            to: normalise(to),
        }),
        (Some("rename"), _) => Err(CommandError::Usage {
            usage: "char rename <old> <new>".into(),
        }),
        (Some("new"), [_, name]) => Ok(Command::CharNew(normalise(name))),
        (Some("new"), _) => Err(CommandError::Usage {
            usage: "char new <name>".into(),
        }),
        _ => Err(CommandError::Usage {
            usage: usage("char"),
        }),
    }
}

/// The usage line of a command, from the vocabulary table.
fn usage(word: &'static str) -> String {
    crate::vocab::usage(word).into()
}

/// Splits `flag` (any case, anywhere) out of `words`; true if it was there.
fn take_flag(words: &[String], flag: &str) -> (Vec<String>, bool) {
    let mut found = false;
    let rest = words
        .iter()
        .filter(|w| {
            let is_flag = w.eq_ignore_ascii_case(flag);
            found |= is_flag;
            !is_flag
        })
        .cloned()
        .collect();
    (rest, found)
}

/// `import <path> [--force]`, with the flag allowed anywhere after `import`.
fn parse_import(rest: &[String]) -> Result<Command, CommandError> {
    let usage = || CommandError::Usage {
        usage: usage("import"),
    };
    let force = rest.iter().any(|w| w.eq_ignore_ascii_case("--force"));
    let mut paths = rest.iter().filter(|w| !w.eq_ignore_ascii_case("--force"));
    match (paths.next(), paths.next()) {
        (Some(path), None) if !path.starts_with("--") => Ok(Command::Import {
            path: PathBuf::from(path),
            force,
        }),
        _ => Err(usage()),
    }
}

/// A lone word that is not a formula but names a saved preset rolls that
/// preset; anything else is a formula.
pub(super) fn roll_or_preset(
    words: &[String],
    preset_names: &mut dyn FnMut() -> Result<Vec<String>, CommandError>,
) -> Result<Command, CommandError> {
    if let [word] = words {
        let name = normalise(word);
        if crate::vocab::session_words().any(|w| w == name) {
            return Err(CommandError::SessionOnly { word: word.clone() });
        }
        // A name-shaped word that fails to parse as a formula (a syntax
        // error, not a bad dice group like `d6dl9`) may be a preset name.
        let not_a_formula = matches!(crate::parser::parse(word), Err(Error::Syntax { .. }));
        if not_a_formula && is_name_shaped(&name) {
            let names = preset_names()?;
            if names.contains(&name) {
                return Ok(Command::RollPreset(name));
            }
            let suggestion = names.into_iter().find(|n| edit_distance(n, &name) <= 2);
            return Err(CommandError::UnknownPreset {
                word: word.clone(),
                suggestion,
            });
        }
    }
    Ok(Command::Roll(words.join(" ")))
}
