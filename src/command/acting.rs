//! The acting character, loaded once per line. Parsing a lone word, rolling,
//! and the desktop sidebar all ask this module about Presets, Variables and
//! the Game system instead of reading the files themselves. Each file is read
//! the first time something asks for it and never again for the same
//! [`ActingCharacter`], so a line costs one read of the Character file and at
//! most one of the Global presets and of the settings.

use super::scope::PresetScope;
use super::{edit_distance, CommandError, Context, PresetEntry, UndefinedVariable};
use crate::characters::Character;
use crate::name::Name;
use crate::{Rules, System};
use std::cell::OnceCell;
use std::collections::BTreeMap;

type Formulas = BTreeMap<String, String>;

/// Where the acting character's data comes from. The disk implementation
/// reads the config directory; tests supply one in memory.
pub(super) trait Source {
    /// The character this call acts on, its data, and whether it was chosen
    /// with `--char`.
    fn character(&self) -> Result<Loaded, CommandError>;
    /// The global presets.
    fn global_presets(&self) -> Result<Formulas, CommandError>;
    /// The global default game system.
    fn default_system(&self) -> Result<Option<System>, CommandError>;
}

#[derive(Clone)]
pub(super) struct Loaded {
    pub(super) name: Name,
    pub(super) character: Character,
    pub(super) explicit: bool,
}

struct DiskSource<'a>(&'a Context);

impl Source for DiskSource<'_> {
    fn character(&self) -> Result<Loaded, CommandError> {
        let (characters, name) = self.0.current()?;
        let character = characters.load(&name)?;
        Ok(Loaded {
            name,
            character,
            explicit: self.0.character.is_some(),
        })
    }

    fn global_presets(&self) -> Result<Formulas, CommandError> {
        Ok(self.0.store()?.load()?)
    }

    fn default_system(&self) -> Result<Option<System>, CommandError> {
        self.0.default_system()
    }
}

/// The character a line acts on (the `--char` override, else the active one),
/// with its Presets, Variables and Game system, and the Global data they fall
/// back to. Built free of I/O by [`Context::acting`]; each file is read on
/// first use and kept.
pub struct ActingCharacter<'a> {
    source: Box<dyn Source + 'a>,
    character: OnceCell<Result<Loaded, CommandError>>,
    global: OnceCell<Result<Formulas, CommandError>>,
    default_system: OnceCell<Result<Option<System>, CommandError>>,
}

fn kept<T>(
    cell: &OnceCell<Result<T, CommandError>>,
    load: impl FnOnce() -> Result<T, CommandError>,
) -> Result<&T, CommandError> {
    cell.get_or_init(load).as_ref().map_err(Clone::clone)
}

impl<'a> ActingCharacter<'a> {
    pub(super) fn new(source: impl Source + 'a) -> Self {
        ActingCharacter {
            source: Box::new(source),
            character: OnceCell::new(),
            global: OnceCell::new(),
            default_system: OnceCell::new(),
        }
    }

    pub(super) fn on_disk(ctx: &'a Context) -> Self {
        Self::new(DiskSource(ctx))
    }

    fn loaded(&self) -> Result<&Loaded, CommandError> {
        kept(&self.character, || self.source.character())
    }

    fn global(&self) -> Result<&Formulas, CommandError> {
        kept(&self.global, || self.source.global_presets())
    }

    /// The acting character's name.
    pub fn name(&self) -> Result<&Name, CommandError> {
        Ok(&self.loaded()?.name)
    }

    /// Whether the character was chosen with `--char` for this line.
    pub fn explicit(&self) -> Result<bool, CommandError> {
        Ok(self.loaded()?.explicit)
    }

    /// The character's variables, name to value.
    pub fn vars(&self) -> Result<&BTreeMap<String, i64>, CommandError> {
        Ok(&self.loaded()?.character.vars)
    }

    /// The character's own game system, if it names one.
    pub fn system(&self) -> Result<Option<System>, CommandError> {
        Ok(self.loaded()?.character.system)
    }

    /// The global default game system, if one is set.
    pub fn default_system(&self) -> Result<Option<System>, CommandError> {
        kept(&self.default_system, || self.source.default_system()).copied()
    }

    /// The rules the character rolls under: its own game system, else the
    /// global default, else none. The default is only read when the character
    /// names no system.
    pub fn rules(&self) -> Result<Rules, CommandError> {
        let character = &self.loaded()?.character;
        Rules::resolve(character.system, character.crit_range, || {
            self.default_system()
        })
    }

    /// Every preset name rolling can reach, sorted.
    pub fn preset_names(&self) -> Result<Vec<String>, CommandError> {
        let mut names = self.scope()?.names();
        names.sort();
        Ok(names)
    }

    /// The formula preset `name` rolls: the character's own, else the global
    /// one. The global presets are only read when the character has no preset
    /// of that name, so a broken global file cannot get in the way of an own
    /// preset.
    pub fn preset_formula(&self, name: &str) -> Result<Option<String>, CommandError> {
        let own = &self.loaded()?.character.presets;
        PresetScope::find(own, name, || self.global())
    }

    /// The `presets` listing: the character's own presets, then the global
    /// ones, each marked when it shadows or is shadowed.
    pub fn preset_entries(&self) -> Result<Vec<PresetEntry>, CommandError> {
        Ok(self.scope()?.entries(self.loaded()?.name.as_str()))
    }

    fn scope(&self) -> Result<PresetScope<'_>, CommandError> {
        Ok(PresetScope::new(
            &self.loaded()?.character.presets,
            self.global()?,
        ))
    }

    /// Turns a library error for `source` into a command error, adding the
    /// character's details to an undefined variable.
    pub(super) fn error(&self, source: &str, error: crate::Error) -> CommandError {
        let plain = |error| CommandError::Formula {
            source: source.to_string(),
            error,
        };
        let crate::Error::UndefinedVariable { name, .. } = &error else {
            return plain(error);
        };
        let Ok(loaded) = self.loaded() else {
            return plain(error);
        };
        let vars = &loaded.character.vars;
        let suggestion = vars
            .keys()
            .filter(|v| edit_distance(v, name) <= 2)
            .min_by_key(|v| edit_distance(v, name))
            .cloned();
        CommandError::UndefinedVariable(Box::new(UndefinedVariable {
            source: source.to_string(),
            name: name.clone(),
            character: loaded.name.to_string(),
            defined: vars.keys().cloned().collect(),
            suggestion,
            explicit: loaded.explicit,
            error,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::rc::Rc;

    /// An in-memory source that counts how often each part is read.
    #[derive(Default)]
    struct Memory {
        character: Character,
        global: Formulas,
        default_system: Option<System>,
        reads: Rc<Reads>,
    }

    #[derive(Default)]
    struct Reads {
        character: Cell<u32>,
        global: Cell<u32>,
        settings: Cell<u32>,
    }

    impl Source for Memory {
        fn character(&self) -> Result<Loaded, CommandError> {
            self.reads.character.set(self.reads.character.get() + 1);
            Ok(Loaded {
                name: Name::stored("grog").unwrap(),
                character: self.character.clone(),
                explicit: false,
            })
        }
        fn global_presets(&self) -> Result<Formulas, CommandError> {
            self.reads.global.set(self.reads.global.get() + 1);
            Ok(self.global.clone())
        }
        fn default_system(&self) -> Result<Option<System>, CommandError> {
            self.reads.settings.set(self.reads.settings.get() + 1);
            Ok(self.default_system)
        }
    }

    fn formulas(pairs: &[(&str, &str)]) -> Formulas {
        pairs
            .iter()
            .map(|(n, f)| (n.to_string(), f.to_string()))
            .collect()
    }

    fn grog() -> (Memory, Rc<Reads>) {
        let memory = Memory {
            character: Character {
                vars: BTreeMap::from([("str".to_string(), 3)]),
                presets: formulas(&[("atk", "d20+@str")]),
                ..Character::default()
            },
            global: formulas(&[("atk", "d20"), ("dmg", "d8")]),
            ..Memory::default()
        };
        let reads = memory.reads.clone();
        (memory, reads)
    }

    #[test]
    fn every_question_about_a_line_reads_each_file_at_most_once() {
        let (memory, reads) = grog();
        let acting = ActingCharacter::new(memory);
        for _ in 0..3 {
            assert_eq!(acting.preset_names().unwrap(), ["atk", "dmg"]);
            assert_eq!(acting.preset_formula("atk").unwrap().unwrap(), "d20+@str");
            assert_eq!(acting.preset_formula("dmg").unwrap().unwrap(), "d8");
            assert_eq!(acting.vars().unwrap()["str"], 3);
            assert_eq!(acting.preset_entries().unwrap().len(), 3);
            acting.rules().unwrap();
        }
        assert_eq!(reads.character.get(), 1);
        assert_eq!(reads.global.get(), 1);
        assert_eq!(reads.settings.get(), 1);
    }

    #[test]
    fn an_own_preset_never_reads_the_global_file() {
        let (memory, reads) = grog();
        let acting = ActingCharacter::new(memory);
        assert_eq!(acting.preset_formula("atk").unwrap().unwrap(), "d20+@str");
        assert_eq!((reads.character.get(), reads.global.get()), (1, 0));
    }

    #[test]
    fn a_character_with_its_own_system_never_reads_the_settings() {
        let (mut memory, reads) = grog();
        memory.character.system = Some(System::Dnd5e);
        let acting = ActingCharacter::new(memory);
        assert_eq!(acting.rules().unwrap().system(), Some(System::Dnd5e));
        assert_eq!(reads.settings.get(), 0);
    }

    #[test]
    fn the_global_default_system_applies_when_the_character_has_none() {
        let (mut memory, _) = grog();
        memory.default_system = Some(System::Dnd5e);
        let acting = ActingCharacter::new(memory);
        assert_eq!(acting.system().unwrap(), None);
        assert_eq!(acting.rules().unwrap().system(), Some(System::Dnd5e));
    }

    #[test]
    fn a_missing_variable_names_the_character_and_suggests_a_near_miss() {
        let (memory, _) = grog();
        let acting = ActingCharacter::new(memory);
        let error = acting.error(
            "@sr",
            crate::Error::UndefinedVariable {
                name: "sr".into(),
                span: 0..3,
            },
        );
        let CommandError::UndefinedVariable(u) = error else {
            panic!("expected an undefined variable, got {error:?}");
        };
        assert_eq!(
            (u.character.as_str(), u.suggestion.as_deref(), u.explicit),
            ("grog", Some("str"), false)
        );
    }
}
