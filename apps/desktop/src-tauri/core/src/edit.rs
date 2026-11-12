//! Typed edits: what the sidebar, the dialogs and the switcher change. Each
//! is run as the same library [`Command`] the CLI runs, with the same
//! validation and errors, but never goes through the line runner, so it is
//! not in the Session's history.

use crate::Execution;
use rand_chacha::ChaCha8Rng;
use rollin::{execute, Command, CommandError, Context, Output, System};
use serde::Deserialize;

/// Which Preset: a Character's own (the active one's) or a Global one.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, ts_rs::TS)]
pub struct PresetKey {
    pub name: String,
    pub global: bool,
}

/// One change to saved data.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, ts_rs::TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Edit {
    /// Save a Preset, replacing one of the same name in that scope.
    SavePreset {
        name: String,
        formula: String,
        global: bool,
    },
    /// Delete a Preset.
    DeletePreset {
        name: String,
        global: bool,
    },
    /// Rename a Preset, or move it between a Character and the Global
    /// presets: save it as `name` in its new place, then delete `from`. One
    /// operation: if any step fails, the data is as it was.
    MovePreset {
        from: PresetKey,
        name: String,
        formula: String,
        global: bool,
    },
    /// Set a Variable on the active Character; the value is as typed.
    SetVariable {
        name: String,
        value: String,
    },
    UnsetVariable {
        name: String,
    },
    SwitchCharacter {
        name: String,
    },
    RenameCharacter {
        from: String,
        to: String,
    },
    DeleteCharacter {
        name: String,
    },
    /// Create a Character and make it active; `system` is its own Game
    /// system, or `None` to use the default.
    NewCharacter {
        name: String,
        system: Option<String>,
    },
}

/// Runs `edit` against `ctx`. The RNG is a throwaway: no edit rolls.
pub(crate) fn run(edit: &Edit, ctx: &Context, rng: &mut ChaCha8Rng) -> Execution {
    match apply(edit, ctx, rng) {
        Ok(output) => Execution::Output(output),
        Err(error) => Execution::Error(error),
    }
}

fn apply(edit: &Edit, ctx: &Context, rng: &mut ChaCha8Rng) -> Result<Output, CommandError> {
    let mut run = |command: &Command| execute(command, ctx, rng);
    match edit {
        Edit::SavePreset {
            name,
            formula,
            global,
        } => run(&Command::save(name, formula, *global)),
        Edit::DeletePreset { name, global } => run(&Command::delete(name, *global)),
        Edit::MovePreset {
            from,
            name,
            formula,
            global,
        } => {
            let saved = run(&Command::save(name, formula, *global))?;
            let same = from.name.to_lowercase() == name.to_lowercase() && from.global == *global;
            if same {
                return Ok(saved);
            }
            match run(&Command::delete(&from.name, from.global)) {
                Ok(_) => Ok(saved),
                Err(error) => {
                    // Put back what the save changed.
                    let undo = match &saved {
                        Output::Saved {
                            replaced: Some(old),
                            ..
                        } => Command::save(name, old, *global),
                        _ => Command::delete(name, *global),
                    };
                    let _ = run(&undo);
                    Err(error)
                }
            }
        }
        Edit::SetVariable { name, value } => run(&Command::set(name, value.trim())?),
        Edit::UnsetVariable { name } => run(&Command::unset(name)),
        Edit::SwitchCharacter { name } => run(&Command::char_switch(name)?),
        Edit::RenameCharacter { from, to } => run(&Command::char_rename(from, to)?),
        Edit::DeleteCharacter { name } => run(&Command::char_delete(name)?),
        Edit::NewCharacter { name, system } => {
            // Check the system first, so a bad one does not leave a new
            // Character behind.
            if let Some(system) = system {
                if System::parse(system).is_none() {
                    return Err(CommandError::UnknownSystem {
                        name: system.clone(),
                    });
                }
            }
            let created = run(&Command::char_new(name))?;
            if system.is_some() {
                let mut own = Context::new(ctx.config_dir.clone());
                own.character = Some(name.to_lowercase());
                own.set_character_system(system.as_deref())?;
            }
            Ok(created)
        }
    }
}
