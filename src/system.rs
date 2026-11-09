//! Game systems: rule sets that give rolls meaning beyond their total.

use crate::ast::{Role, Roll};
use crate::{Die, Natural, Node, RollResult};
use serde::Serialize;

/// A game system a character (or the global settings) can name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum System {
    /// Dungeons & Dragons 5th edition: a natural 20 on a d20 attack is a
    /// critical hit, which doubles the dice of its damage; a natural 1 is a
    /// critical miss.
    Dnd5e,
}

impl System {
    /// The value written in a TOML file.
    pub fn as_str(self) -> &'static str {
        match self {
            System::Dnd5e => "dnd5e",
        }
    }

    /// The system a TOML value names (case-insensitive).
    pub fn parse(text: &str) -> Option<System> {
        match text.trim().to_ascii_lowercase().as_str() {
            "dnd5e" => Some(System::Dnd5e),
            _ => None,
        }
    }

    /// Every system, for error messages.
    pub const ALL: [System; 1] = [System::Dnd5e];
}

/// How an attack under a game system turned out at the extremes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Crit {
    /// A natural 20.
    Hit,
    /// A natural 1. Flagged only: it changes no dice.
    Miss,
}

/// The lowest kept d20 that is a critical hit: `19` means 19-20. Defaults to
/// 20. A natural 20 always meets it, so only the natural 1 stays a miss.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CritRange(u8);

impl CritRange {
    /// Valid thresholds are 2 to 20: a 1 is always the critical miss.
    pub const MIN: u8 = 2;
    pub const MAX: u8 = 20;

    pub fn new(threshold: i64) -> Option<CritRange> {
        let t = u8::try_from(threshold).ok()?;
        (Self::MIN..=Self::MAX).contains(&t).then_some(CritRange(t))
    }

    pub fn get(self) -> u8 {
        self.0
    }
}

impl Default for CritRange {
    fn default() -> CritRange {
        CritRange(Self::MAX)
    }
}

/// The `crit_range` value of a TOML table at `path`, if it has one.
pub(crate) fn read_crit_range(
    table: &toml::Table,
    path: &std::path::Path,
) -> Result<Option<CritRange>, crate::StoreError> {
    let bad = || {
        crate::StoreError::at(
            path,
            format!(
                "`crit_range` must be an integer from {} to {}",
                CritRange::MIN,
                CritRange::MAX
            ),
        )
    };
    match table.get("crit_range") {
        None => Ok(None),
        Some(toml::Value::Integer(n)) => CritRange::new(*n).map(Some).ok_or_else(bad),
        Some(_) => Err(bad()),
    }
}

/// The `system` value of a TOML table at `path`, if it has one.
pub(crate) fn read_system(
    table: &toml::Table,
    path: &std::path::Path,
) -> Result<Option<System>, crate::StoreError> {
    match table.get("system") {
        None => Ok(None),
        Some(toml::Value::String(text)) => System::parse(text).map(Some).ok_or_else(|| {
            let known: Vec<String> = System::ALL
                .iter()
                .map(|s| format!("\"{}\"", s.as_str()))
                .collect();
            crate::StoreError::at(
                path,
                format!("`system` must be one of {}", known.join(", ")),
            )
        }),
        Some(_) => Err(crate::StoreError::at(path, "`system` must be a string")),
    }
}

/// The rules a roll runs under: a game system (or none) and its crit range.
///
/// This is the one place that answers three questions: which system a
/// character rolls under, whether a roll is a crit, and whether its damage
/// doubles. Callers hold a `Rules` instead of passing `system` and
/// `crit_range` around.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Rules {
    system: Option<System>,
    crit_range: CritRange,
}

impl Rules {
    /// No game system: every roll stands alone.
    pub const NONE: Rules = Rules {
        system: None,
        crit_range: CritRange(CritRange::MAX),
    };

    /// Rules for `system` with the given crit range (`None` is the default,
    /// a natural 20 only).
    pub fn new(system: Option<System>, crit_range: Option<CritRange>) -> Rules {
        Rules {
            system,
            crit_range: crit_range.unwrap_or_default(),
        }
    }

    /// The rules a character rolls under: its own system, else the global
    /// default, else none. `default` is only asked when the character names
    /// no system, so a missing or bad settings file does not matter to a
    /// character that has its own.
    pub fn resolve<E>(
        own: Option<System>,
        crit_range: Option<CritRange>,
        default: impl FnOnce() -> Result<Option<System>, E>,
    ) -> Result<Rules, E> {
        let system = match own {
            Some(system) => Some(system),
            None => default()?,
        };
        Ok(Rules::new(system, crit_range))
    }

    /// The system these rules run under, if any.
    pub fn system(&self) -> Option<System> {
        self.system
    }

    /// Pairs attacks with the damage that follows them for one run of rolls.
    pub(crate) fn pairing(&self) -> Pairing {
        Pairing {
            rules: *self,
            attack: None,
        }
    }
}

/// The crit of the latest attack in a run of rolls, which later damage rolls
/// belong to. Start a new one for each `Nx` repeat.
pub(crate) struct Pairing {
    rules: Rules,
    attack: Option<Crit>,
}

impl Pairing {
    fn role(&self, spec: &Roll) -> Option<Role> {
        self.rules.system.and_then(|_| spec.role())
    }

    /// Whether `spec`'s dice double: by its `crit` suffix, or because it is
    /// damage following a critical hit.
    pub(crate) fn doubles(&self, spec: &Roll) -> bool {
        spec.crit || (self.role(spec) == Some(Role::Damage) && self.attack == Some(Crit::Hit))
    }

    /// Records the verdict on an evaluated `roll` that was an attack.
    pub(crate) fn judge(&mut self, spec: &Roll, roll: &mut RollResult) {
        if self.role(spec) == Some(Role::Attack) {
            roll.crit = verdict(spec, roll, self.rules.crit_range);
            self.attack = roll.crit;
        }
    }
}

/// A natural 1 is a miss, a kept d20 at or above `range` is a hit, and
/// anything else (or a roll with no d20 check) is neither.
fn verdict(spec: &Roll, roll: &mut RollResult, range: CritRange) -> Option<Crit> {
    if roll.natural() == Some(Natural::One) {
        return Some(Crit::Miss);
    }
    let face = check_die(spec, &mut roll.expr)?.value;
    (face >= i64::from(range.get())).then_some(Crit::Hit)
}

/// The kept die of a roll's d20 check, if the roll is one: its single d20
/// group, and the one die left standing in it (rerolled dice are history,
/// dropped dice are out, so `d20adv` and `2d20kh1` read the kept die).
pub(crate) fn check_die<'a>(spec: &Roll, root: &'a mut Node) -> Option<&'a mut Die> {
    if !spec.expr.is_d20_check() {
        return None;
    }
    fn d20_terms<'a>(node: &'a mut Node, out: &mut Vec<&'a mut Node>) {
        match node {
            Node::Dice { sides: 20, .. } => out.push(node),
            Node::Dice { .. } | Node::Number { .. } => {}
            Node::Neg { operand, .. } => d20_terms(operand, out),
            Node::Group { inner, .. } => d20_terms(inner, out),
            Node::Chain { first, rest, .. } => {
                d20_terms(first, out);
                for link in rest {
                    d20_terms(&mut link.node, out);
                }
            }
        }
    }
    let mut terms = Vec::new();
    d20_terms(root, &mut terms);
    let (1, Some(Node::Dice { dice, tally, .. })) = (terms.len(), terms.pop()) else {
        return None;
    };
    if tally.is_some() {
        return None;
    }
    let mut standing = dice.iter_mut().filter(|d| d.status.counts());
    let (Some(die), None) = (standing.next(), standing.next()) else {
        return None;
    };
    // A compounded explosion is a sum of rolls, not a face.
    if die.parts.len() > 1 {
        return None;
    }
    Some(die)
}

/// Marks the kept die of a d20 check that rolled a natural 20 or 1.
pub(crate) fn mark_natural(spec: &Roll, root: &mut Node) {
    if let Some(die) = check_die(spec, root) {
        die.natural = match die.value {
            20 => Some(Natural::Twenty),
            1 => Some(Natural::One),
            _ => None,
        };
    }
}
