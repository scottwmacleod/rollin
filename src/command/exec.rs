use super::context::require_character;
use super::parse::roll_or_preset;
use super::{import, ActingCharacter, Command, CommandError, Context, Output};
use crate::characters::{Character, DEFAULT};
use crate::name::{normalise, Name};
use crate::Error;
use rand::Rng;

/// Runs a command, reading the acting character as the command needs it.
pub fn execute(
    command: &Command,
    ctx: &Context,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    execute_with(command, ctx, &ctx.acting(), rng)
}

/// Runs a command against an acting character that parsing the same line
/// has already used, so the line reads each file once. `acting` must be
/// `ctx.acting()` from before this command writes anything.
pub fn execute_with(
    command: &Command,
    ctx: &Context,
    acting: &ActingCharacter,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    let store = ctx.store()?;
    match command {
        Command::Roll(formula) => roll_formula(formula, None, acting, rng),
        Command::RollPreset(name) => {
            let formula = acting.preset_formula(name)?.unwrap_or_default();
            roll_formula(&formula, Some((name.clone(), formula.clone())), acting, rng)
        }
        Command::Save {
            name,
            formula,
            global,
        } => {
            let name = Name::preset(name)
                .map_err(CommandError::InvalidName)?
                .into_string();
            check_formula(formula)?;
            if *global {
                let mut presets = store.load()?;
                let replaced = presets.insert(name.clone(), formula.clone());
                store.save(&presets)?;
                return Ok(Output::Saved {
                    name,
                    formula: formula.clone(),
                    character: None,
                    replaced,
                });
            }
            let (replaced, active) = ctx.update_character(|character, _| {
                Ok(character.presets.insert(name.clone(), formula.clone()))
            })?;
            Ok(Output::Saved {
                name,
                formula: formula.clone(),
                character: Some(active.into_string()),
                replaced,
            })
        }
        Command::Delete { name, global } => {
            let name = normalise(name);
            let mut globals = store.load()?;
            if *global {
                if globals.remove(&name).is_none() {
                    return Err(CommandError::NoSuchPreset { name });
                }
                store.save(&globals)?;
                return Ok(Output::Deleted {
                    name,
                    character: None,
                });
            }
            let ((), active) = ctx.update_character(|character, active| {
                if character.presets.remove(&name).is_none() {
                    return Err(CommandError::NoSuchCharacterPreset {
                        global_exists: globals.contains_key(&name),
                        name: name.clone(),
                        character: active.to_string(),
                    });
                }
                Ok(())
            })?;
            Ok(Output::Deleted {
                name,
                character: Some(active.into_string()),
            })
        }
        Command::Import { path, force } => import::run(path, *force, &store),
        Command::Presets => Ok(Output::Presets {
            presets: acting.preset_entries()?,
        }),
        Command::Set { name, value } => {
            let ((), active) = ctx.update_character(|character, _| {
                character.vars.insert(name.clone(), *value);
                Ok(())
            })?;
            Ok(Output::VarSet {
                name: name.clone(),
                value: *value,
                character: active.into_string(),
            })
        }
        Command::Characters => {
            let characters = ctx.characters()?;
            Ok(Output::Characters {
                names: characters
                    .names()?
                    .into_iter()
                    .map(Name::into_string)
                    .collect(),
                active: ctx.acting_name(&characters)?.into_string(),
            })
        }
        Command::CharShow => {
            let characters = ctx.characters()?;
            Ok(Output::ActiveCharacter {
                name: ctx.acting_name(&characters)?.into_string(),
            })
        }
        Command::CharSwitch(name) => {
            let characters = ctx.characters()?;
            require_character(&characters, name)?;
            characters.set_active(name)?;
            Ok(Output::CharSwitched {
                name: name.to_string(),
            })
        }
        Command::CharDelete(name) => {
            let characters = ctx.characters()?;
            if name.as_str() == DEFAULT {
                return Err(CommandError::CannotDeleteDefault);
            }
            require_character(&characters, name)?;
            let was_active = characters.active()? == *name;
            characters.delete(name)?;
            if was_active {
                characters.set_active(&Name::default_character())?;
            }
            Ok(Output::CharDeleted {
                name: name.to_string(),
                was_active,
            })
        }
        Command::CharRename { from, to } => {
            let characters = ctx.characters()?;
            if from.as_str() == DEFAULT {
                return Err(CommandError::CannotRenameDefault);
            }
            require_character(&characters, from)?;
            let to = Name::character(to).map_err(CommandError::InvalidCharName)?;
            if characters.exists(&to) {
                return Err(CommandError::CharacterExists {
                    name: to.into_string(),
                });
            }
            let was_active = characters.active()? == *from;
            characters.rename(from, &to)?;
            if was_active {
                characters.set_active(&to)?;
            }
            Ok(Output::CharRenamed {
                from: from.to_string(),
                to: to.into_string(),
            })
        }
        Command::CharNew(name) => {
            let characters = ctx.characters()?;
            let name = Name::character(name).map_err(CommandError::InvalidCharName)?;
            if characters.exists(&name) {
                return Err(CommandError::CharacterExists {
                    name: name.into_string(),
                });
            }
            let name = &name;
            characters.active()?;
            characters.save(name, &Character::default())?;
            characters.set_active(name)?;
            Ok(Output::CharCreated {
                name: name.to_string(),
            })
        }
        Command::Unset { name } => {
            let ((), active) = ctx.update_character(|character, active| {
                if character.vars.remove(name).is_none() {
                    return Err(CommandError::NoSuchVariable {
                        name: name.clone(),
                        character: active.to_string(),
                    });
                }
                Ok(())
            })?;
            Ok(Output::VarUnset {
                name: name.clone(),
                character: active.into_string(),
            })
        }
        Command::Vars => Ok(Output::Vars {
            vars: acting
                .vars()?
                .iter()
                .map(|(k, v)| (k.clone(), *v))
                .collect(),
        }),
    }
}

/// Checks a formula the way rolling it would, without rolling.
///
/// `formula` is read as one command-line argument: a lone word naming a
/// preset checks that preset's formula, anything else is a formula. It is
/// lexed, parsed and resolved against the acting character (`ctx.character`
/// or the active one) and the presets reachable from it, then the arithmetic
/// that does not depend on dice is evaluated, so `d20/0` and constant
/// overflow are caught. The result is the [`CommandError`] rolling the same
/// text would give, so a caller can draw the CLI's caret from
/// [`CommandError::Formula`] (`source` plus `error.span()`), and an unknown
/// `@variable` or preset carries the same details and suggestions.
///
/// It takes no RNG and only reads the saved data: no roll is made and no
/// character, preset or history file is written. What depends on the dice
/// themselves (a divisor that happens to roll 0, an explosion or reroll cap)
/// can only fail when actually rolling. A blank formula is an error, as it is
/// when rolling.
pub fn check(formula: &str, ctx: &Context) -> Result<(), CommandError> {
    let acting = ctx.acting();
    let source = resolve(formula, ctx, &acting)?;
    let vars = acting.vars()?;
    crate::parser::check_with(&source, &|name| vars.get(name).copied())
        .map_err(|error| acting.error(&source, error))
}

/// Rolls a formula the way [`check`] reads it, for a preview.
///
/// `formula` is resolved exactly as in [`check`] (a lone preset name rolls
/// that preset), and rolled with the caller's `rng` under the character's
/// game system. Nothing is written: it makes no history entry and touches no
/// character or preset file, and it uses only the RNG it is given, so a
/// caller that passes a throwaway one leaves its own session RNG, seeded or
/// not, where it was. Errors are the ones rolling the same text would give.
pub fn sample(
    formula: &str,
    ctx: &Context,
    rng: &mut impl Rng,
) -> Result<Vec<crate::RollResult>, CommandError> {
    let acting = ctx.acting();
    let source = resolve(formula, ctx, &acting)?;
    let vars = acting.vars()?;
    let rules = acting.rules()?;
    crate::roll_in(&source, &|name| vars.get(name).copied(), rules, rng)
        .map_err(|error| acting.error(&source, error))
}

/// The text a formula resolves to, with a lone preset name replaced by that
/// preset's formula.
fn resolve(formula: &str, ctx: &Context, acting: &ActingCharacter) -> Result<String, CommandError> {
    ctx.store()?;
    let command = roll_or_preset(&[formula.to_string()], &mut || acting.preset_names())?;
    match command {
        Command::RollPreset(name) => Ok(acting.preset_formula(&name)?.unwrap_or_default()),
        Command::Roll(formula) => Ok(formula),
        _ => unreachable!("roll_or_preset gives a roll or a preset roll"),
    }
}

/// Whether `formula` is acceptable to save. Variables are not known until
/// the preset is rolled, so each `@name` stands in as 2 and any non-syntax
/// error that touches a variable is ignored (it may only be the stand-in's
/// fault). Real syntax errors, and every error in a formula without
/// variables, are reported.
pub(super) fn check_formula(formula: &str) -> Result<(), CommandError> {
    match crate::parser::parse_with(formula, &|_| Some(2)) {
        Ok(_) => Ok(()),
        Err(Error::WithVariables { inner, .. }) => match *inner {
            Error::Syntax { .. } => Err(CommandError::Formula {
                source: formula.to_string(),
                // Without the stand-in value, which the user never typed.
                error: *inner,
            }),
            _ => Ok(()),
        },
        Err(error) => Err(CommandError::Formula {
            source: formula.to_string(),
            error,
        }),
    }
}

fn roll_formula(
    formula: &str,
    preset: Option<(String, String)>,
    acting: &ActingCharacter,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    let vars = acting.vars()?;
    let rules = acting.rules()?;
    crate::roll_in(formula, &|name| vars.get(name).copied(), rules, rng)
        .map(|rolls| Output::Rolls { preset, rolls })
        .map_err(|error| acting.error(formula, error))
}
