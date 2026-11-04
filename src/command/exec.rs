use super::context::require_character;
use super::parse::roll_or_preset;
use super::{
    edit_distance, import, Command, CommandError, Context, Output, PresetEntry, PresetSource,
    Shadow, UndefinedVariable,
};
use crate::characters::{Character, DEFAULT};
use crate::name::{normalise, Name};
use crate::Error;
use rand::Rng;
use std::collections::BTreeMap;

/// Runs a command.
pub fn execute(
    command: &Command,
    ctx: &Context,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    let store = ctx.store()?;
    match command {
        Command::Roll(formula) => {
            let scope = Scope::load(ctx)?;
            roll_formula(formula, None, &scope, rng)
        }
        Command::RollPreset(name) => {
            let scope = Scope::load(ctx)?;
            let formula = match scope.presets.get(name) {
                Some(formula) => formula.clone(),
                None => store.load()?.remove(name).unwrap_or_default(),
            };
            roll_formula(&formula, Some((name.clone(), formula.clone())), &scope, rng)
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
            let (characters, active) = ctx.current()?;
            let mut character = characters.load(&active)?;
            let replaced = character.presets.insert(name.clone(), formula.clone());
            characters.save(&active, &character)?;
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
            let (characters, active) = ctx.current()?;
            let mut character = characters.load(&active)?;
            if character.presets.remove(&name).is_none() {
                return Err(CommandError::NoSuchCharacterPreset {
                    global_exists: globals.contains_key(&name),
                    name,
                    character: active.into_string(),
                });
            }
            characters.save(&active, &character)?;
            Ok(Output::Deleted {
                name,
                character: Some(active.into_string()),
            })
        }
        Command::Import { path, force } => import::run(path, *force, &store),
        Command::Presets => {
            let (characters, active) = ctx.current()?;
            let own_presets = characters.load(&active)?.presets;
            let global_presets = store.load()?;
            let own = own_presets.iter().map(|(name, formula)| PresetEntry {
                name: name.clone(),
                formula: formula.clone(),
                source: PresetSource::Character(active.to_string()),
                shadow: if global_presets.contains_key(name) {
                    Shadow::Shadows
                } else {
                    Shadow::None
                },
            });
            let global = global_presets.iter().map(|(name, formula)| PresetEntry {
                name: name.clone(),
                formula: formula.clone(),
                source: PresetSource::Global,
                shadow: if own_presets.contains_key(name) {
                    Shadow::ShadowedBy(active.to_string())
                } else {
                    Shadow::None
                },
            });
            Ok(Output::Presets {
                presets: own.chain(global).collect(),
            })
        }
        Command::Set { name, value } => {
            let (characters, active) = ctx.current()?;
            let mut character = characters.load(&active)?;
            character.vars.insert(name.clone(), *value);
            characters.save(&active, &character)?;
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
            let (characters, active) = ctx.current()?;
            let mut character = characters.load(&active)?;
            if character.vars.remove(name).is_none() {
                return Err(CommandError::NoSuchVariable {
                    name: name.clone(),
                    character: active.into_string(),
                });
            }
            characters.save(&active, &character)?;
            Ok(Output::VarUnset {
                name: name.clone(),
                character: active.into_string(),
            })
        }
        Command::Vars => {
            let (characters, active) = ctx.current()?;
            let character = characters.load(&active)?;
            Ok(Output::Vars {
                vars: character.vars.into_iter().collect(),
            })
        }
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
    let store = ctx.store()?;
    let command = roll_or_preset(&[formula.to_string()], &mut || ctx.preset_names())?;
    let scope = Scope::load(ctx)?;
    let source = match command {
        Command::RollPreset(name) => match scope.presets.get(&name) {
            Some(formula) => formula.clone(),
            None => store.load()?.remove(&name).unwrap_or_default(),
        },
        Command::Roll(formula) => formula,
        _ => unreachable!("roll_or_preset gives a roll or a preset roll"),
    };
    crate::parser::check_with(&source, &|name| scope.vars.get(name).copied())
        .map_err(|error| scope.error(&source, error))
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

/// The character whose variables a formula is rolled against.
struct Scope {
    name: Name,
    vars: BTreeMap<String, i64>,
    /// The character's own presets, which shadow global ones.
    presets: BTreeMap<String, String>,
    /// Whether the character was chosen with `--char`.
    explicit: bool,
}

impl Scope {
    fn load(ctx: &Context) -> Result<Scope, CommandError> {
        let (characters, name) = ctx.current()?;
        let character = characters.load(&name)?;
        Ok(Scope {
            name,
            vars: character.vars,
            presets: character.presets,
            explicit: ctx.character.is_some(),
        })
    }

    /// Turns a library error for `source` into a command error, adding the
    /// character's details to an undefined variable.
    fn error(&self, source: &str, error: Error) -> CommandError {
        match &error {
            Error::UndefinedVariable { name, .. } => {
                let suggestion = self
                    .vars
                    .keys()
                    .filter(|v| edit_distance(v, name) <= 2)
                    .min_by_key(|v| edit_distance(v, name))
                    .cloned();
                CommandError::UndefinedVariable(Box::new(UndefinedVariable {
                    source: source.to_string(),
                    name: name.clone(),
                    character: self.name.to_string(),
                    defined: self.vars.keys().cloned().collect(),
                    suggestion,
                    explicit: self.explicit,
                    error,
                }))
            }
            _ => CommandError::Formula {
                source: source.to_string(),
                error,
            },
        }
    }
}

fn roll_formula(
    formula: &str,
    preset: Option<(String, String)>,
    scope: &Scope,
    rng: &mut impl Rng,
) -> Result<Output, CommandError> {
    crate::roll_with(formula, &|name| scope.vars.get(name).copied(), rng)
        .map(|rolls| Output::Rolls { preset, rolls })
        .map_err(|error| scope.error(formula, error))
}
