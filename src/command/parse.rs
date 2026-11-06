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
                    usage: "save <name> <formula> [--global]".into(),
                }),
            }
        }
        Some("roll") if rest.is_empty() => Err(CommandError::Usage {
            usage: "roll <formula or preset name>".into(),
        }),
        Some("roll") => roll_or_preset(rest, preset_names),
        Some("characters") => Ok(Command::Characters),
        Some("char") => match rest {
            [] => Ok(Command::CharShow),
            [delete, name] if delete.eq_ignore_ascii_case("delete") => Ok(Command::CharDelete(
                Name::shaped(name).map_err(CommandError::InvalidCharName)?,
            )),
            [rename, from, to] if rename.eq_ignore_ascii_case("rename") => {
                Ok(Command::CharRename {
                    from: Name::shaped(from).map_err(CommandError::InvalidCharName)?,
                    to: normalise(to),
                })
            }
            [rename, ..] if rename.eq_ignore_ascii_case("rename") => Err(CommandError::Usage {
                usage: "char rename <old> <new>".into(),
            }),
            [new, name] if new.eq_ignore_ascii_case("new") => Ok(Command::CharNew(normalise(name))),
            [new] if new.eq_ignore_ascii_case("new") => Err(CommandError::Usage {
                usage: "char new <name>".into(),
            }),
            [name] => Ok(Command::CharSwitch(
                Name::shaped(name).map_err(CommandError::InvalidCharName)?,
            )),
            _ => Err(CommandError::Usage {
                usage: "char [<name> | new <name> | rename <old> <new> | delete <name>]".into(),
            }),
        },
        Some("unset") => match rest {
            [name] => Ok(Command::Unset {
                name: normalise(name),
            }),
            _ => Err(CommandError::Usage {
                usage: "unset <name>".into(),
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
                usage: "set <name> <integer>".into(),
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
                    usage: "delete <name> [--global]".into(),
                }),
            }
        }
        _ => roll_or_preset(words, preset_names),
    }
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
        usage: "import <path> [--force]".into(),
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
        if crate::session::SESSION_WORDS.contains(&name.as_str()) {
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
