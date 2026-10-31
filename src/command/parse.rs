use super::{edit_distance, Command, CommandError};
use crate::presets::{is_name_shaped, validate_name, NameError, NameRule};
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
                _ => Err(CommandError::Usage(
                    "save <name> <formula> [--global]".into(),
                )),
            }
        }
        Some("roll") if rest.is_empty() => {
            Err(CommandError::Usage("roll <formula or preset name>".into()))
        }
        Some("roll") => roll_or_preset(rest, preset_names),
        Some("characters") => Ok(Command::Characters),
        Some("char") => match rest {
            [] => Ok(Command::CharShow),
            [delete, name] if delete.eq_ignore_ascii_case("delete") => {
                Ok(Command::CharDelete(char_name_shape(name)?))
            }
            [new, name] if new.eq_ignore_ascii_case("new") => {
                Ok(Command::CharNew(name.to_lowercase()))
            }
            [new] if new.eq_ignore_ascii_case("new") => {
                Err(CommandError::Usage("char new <name>".into()))
            }
            [name] => Ok(Command::CharSwitch(char_name_shape(name)?)),
            _ => Err(CommandError::Usage("char [<name> | new <name>]".into())),
        },
        Some("unset") => match rest {
            [name] => Ok(Command::Unset {
                name: name.to_lowercase(),
            }),
            _ => Err(CommandError::Usage("unset <name>".into())),
        },
        Some("vars") => Ok(Command::Vars),
        Some("set") => match rest {
            [name, value] => Ok(Command::Set {
                name: validate_var_name(name)?,
                value: value
                    .parse()
                    .map_err(|_| CommandError::NotAnInteger(value.clone()))?,
            }),
            _ => Err(CommandError::Usage("set <name> <integer>".into())),
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
                _ => Err(CommandError::Usage("delete <name> [--global]".into())),
            }
        }
        _ => roll_or_preset(words, preset_names),
    }
}

/// Lowercases a character name and checks it is `[a-z][a-z0-9_-]*`, so a name
/// can never reach outside the characters directory.
pub(super) fn char_name_shape(raw: &str) -> Result<String, CommandError> {
    let name = raw.to_lowercase();
    if is_name_shaped(&name) {
        Ok(name)
    } else {
        Err(CommandError::InvalidCharName(NameError {
            name: raw.to_string(),
            rule: NameRule::Shape,
        }))
    }
}

/// Checks a character name and returns its stored (lowercase) form.
pub(super) fn validate_char_name(raw: &str) -> Result<String, CommandError> {
    if raw.eq_ignore_ascii_case("new") {
        return Err(CommandError::InvalidCharName(NameError {
            name: raw.to_string(),
            rule: NameRule::CommandWord,
        }));
    }
    validate_name(raw).map_err(CommandError::InvalidCharName)
}

/// Checks a variable name and returns its stored (lowercase) form.
fn validate_var_name(raw: &str) -> Result<String, CommandError> {
    let name = raw.to_lowercase();
    let mut chars = name.chars();
    let valid = chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
    if valid {
        Ok(name)
    } else {
        Err(CommandError::InvalidVarName(raw.to_string()))
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
    let usage = || CommandError::Usage("import <path> [--force]".into());
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
fn roll_or_preset(
    words: &[String],
    preset_names: &mut dyn FnMut() -> Result<Vec<String>, CommandError>,
) -> Result<Command, CommandError> {
    if let [word] = words {
        let name = word.to_lowercase();
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
