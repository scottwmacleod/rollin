//! Where a preset name resolves. A character's own presets shadow global
//! ones of the same name; this file is the only place that rule lives.

use super::{PresetEntry, PresetSource, Shadow};
use std::collections::BTreeMap;

type Formulas = BTreeMap<String, String>;

/// The presets one character can reach: its own, then the global ones.
pub(super) struct PresetScope<'a> {
    own: &'a Formulas,
    global: &'a Formulas,
}

impl<'a> PresetScope<'a> {
    pub(super) fn new(own: &'a Formulas, global: &'a Formulas) -> Self {
        PresetScope { own, global }
    }

    /// The formula `name` rolls: the character's own, else the global one.
    /// `global` is only loaded when the character has no preset of that name,
    /// so a broken global file cannot get in the way of an own preset.
    pub(super) fn find<E>(
        own: &Formulas,
        name: &str,
        global: impl FnOnce() -> Result<&'a Formulas, E>,
    ) -> Result<Option<String>, E> {
        match own.get(name) {
            Some(formula) => Ok(Some(formula.clone())),
            None => Ok(global()?.get(name).cloned()),
        }
    }

    /// Every reachable name once, the character's own first.
    pub(super) fn names(&self) -> Vec<String> {
        let mut names: Vec<String> = self.own.keys().cloned().collect();
        names.extend(
            self.global
                .keys()
                .filter(|name| !self.own.contains_key(*name))
                .cloned(),
        );
        names
    }

    /// The `presets` listing for `character`: its own presets, then the
    /// global ones, each marked when it shadows or is shadowed.
    pub(super) fn entries(&self, character: &str) -> Vec<PresetEntry> {
        let own = self.own.iter().map(|(name, formula)| PresetEntry {
            name: name.clone(),
            formula: formula.clone(),
            source: PresetSource::Character(character.to_string()),
            shadow: if self.global.contains_key(name) {
                Shadow::Shadows
            } else {
                Shadow::None
            },
        });
        let global = self.global.iter().map(|(name, formula)| PresetEntry {
            name: name.clone(),
            formula: formula.clone(),
            source: PresetSource::Global,
            shadow: if self.own.contains_key(name) {
                Shadow::ShadowedBy(character.to_string())
            } else {
                Shadow::None
            },
        });
        own.chain(global).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::convert::Infallible;

    fn formulas(pairs: &[(&str, &str)]) -> Formulas {
        pairs
            .iter()
            .map(|(n, f)| (n.to_string(), f.to_string()))
            .collect()
    }

    #[test]
    fn an_own_preset_shadows_the_global_one() {
        let own = formulas(&[("atk", "d20+7")]);
        let global = formulas(&[("atk", "d20")]);
        let found = PresetScope::find(&own, "atk", || -> Result<_, Infallible> { Ok(&global) });
        assert_eq!(found, Ok(Some("d20+7".into())));
    }

    #[test]
    fn the_global_file_is_not_read_when_an_own_preset_matches() {
        let own = formulas(&[("atk", "d20+7")]);
        let found = PresetScope::find(&own, "atk", || Err("global file read"));
        assert_eq!(found, Ok(Some("d20+7".into())));
    }

    #[test]
    fn a_global_preset_is_used_when_the_character_has_none() {
        let global = formulas(&[("atk", "d20")]);
        let found = PresetScope::find(&Formulas::new(), "atk", || -> Result<_, Infallible> {
            Ok(&global)
        });
        assert_eq!(found, Ok(Some("d20".into())));
        let missing = PresetScope::find(&Formulas::new(), "nope", || -> Result<_, Infallible> {
            Ok(&global)
        });
        assert_eq!(missing, Ok(None));
    }

    #[test]
    fn names_list_each_once_with_the_characters_first() {
        let (own, global) = (
            formulas(&[("b", "d6"), ("a", "d4")]),
            formulas(&[("a", "d20"), ("c", "d8")]),
        );
        let scope = PresetScope::new(&own, &global);
        assert_eq!(scope.names(), ["a", "b", "c"]);
    }

    #[test]
    fn entries_mark_what_shadows_what() {
        let (own, global) = (
            formulas(&[("a", "d4")]),
            formulas(&[("a", "d20"), ("c", "d8")]),
        );
        let scope = PresetScope::new(&own, &global);
        let entries = scope.entries("grog");
        let marks: Vec<_> = entries
            .iter()
            .map(|e| (e.name.as_str(), e.source.clone(), e.shadow.clone()))
            .collect();
        assert_eq!(
            marks,
            [
                ("a", PresetSource::Character("grog".into()), Shadow::Shadows),
                ("a", PresetSource::Global, Shadow::ShadowedBy("grog".into())),
                ("c", PresetSource::Global, Shadow::None),
            ]
        );
    }
}
