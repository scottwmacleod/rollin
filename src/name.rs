//! Names of presets, characters and variables. [`Name`] is the only way to
//! get one: its constructors validate and lowercase, so code holding a `Name`
//! never re-checks it. The rules differ by kind, so each kind has a
//! constructor.

/// Words the formula lexer and parser treat as keywords.
const DICE_KEYWORDS: [&str; 11] = [
    "d", "dl", "dh", "kl", "kh", "r", "rr", "p", "f", "adv", "dis",
];

/// Why a string cannot be a preset name. The name is as the user typed it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct NameError {
    pub name: String,
    pub rule: NameRule,
}

/// The rule a rejected name broke.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NameRule {
    /// Not `[a-z][a-z0-9_-]*` after lowercasing.
    Shape,
    CommandWord,
    DiceKeyword,
    /// The name parses as a complete dice formula.
    ParsesAsFormula,
    /// The name is dice syntax with invalid values (`d0`), so it could never
    /// be rolled by name.
    LooksLikeDice,
}

impl NameError {
    /// Which rule failed, without the name.
    pub fn reason(&self) -> String {
        match self.rule {
            NameRule::Shape => {
                "names must start with a letter and use only letters, digits, '_' or '-'".into()
            }
            NameRule::CommandWord if self.name.eq_ignore_ascii_case("new") => {
                "'new' is reserved for `rollin char new`".into()
            }
            NameRule::CommandWord if self.name.eq_ignore_ascii_case("rename") => {
                "'rename' is reserved for `rollin char rename`".into()
            }
            NameRule::CommandWord => {
                format!(
                    "it is a command word ({})",
                    crate::vocab::words().collect::<Vec<_>>().join(", ")
                )
            }
            NameRule::DiceKeyword => "it is a reserved dice keyword".into(),
            NameRule::LooksLikeDice => "it looks like dice syntax".into(),
            NameRule::ParsesAsFormula => {
                format!("it would parse as the dice formula {}", self.name)
            }
        }
    }
}

impl std::fmt::Display for NameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid preset name '{}': {}", self.name, self.reason())
    }
}

impl std::error::Error for NameError {}

/// A validated, lowercase name.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Name(String);

impl Name {
    /// A preset name: shaped `[a-z][a-z0-9_-]*` (after lowercasing), not a
    /// command word or dice keyword, and not parseable as a formula.
    pub fn preset(raw: &str) -> Result<Name, NameError> {
        let name = normalise(raw);
        let fail = |rule| NameError {
            name: raw.to_string(),
            rule,
        };
        if !is_name_shaped(&name) {
            Err(fail(NameRule::Shape))
        } else if crate::vocab::words().any(|w| w == name) {
            Err(fail(NameRule::CommandWord))
        } else if DICE_KEYWORDS.contains(&name.as_str()) {
            Err(fail(NameRule::DiceKeyword))
        } else {
            match crate::parser::parse(&name) {
                Ok(_) => Err(fail(NameRule::ParsesAsFormula)),
                Err(crate::Error::Syntax { .. }) => Ok(Name(name)),
                Err(_) => Err(fail(NameRule::LooksLikeDice)),
            }
        }
    }

    /// A name for a new character: a preset name that is also not `new`,
    /// which `char new` would read as its own subcommand.
    pub fn character(raw: &str) -> Result<Name, NameError> {
        if raw.eq_ignore_ascii_case("new") || raw.eq_ignore_ascii_case("rename") {
            return Err(NameError {
                name: raw.to_string(),
                rule: NameRule::CommandWord,
            });
        }
        Name::preset(raw)
    }

    /// A reference to a character that may already exist: only the shape is
    /// checked, so a name can never reach outside the characters directory.
    pub fn shaped(raw: &str) -> Result<Name, NameError> {
        let name = normalise(raw);
        if is_name_shaped(&name) {
            Ok(Name(name))
        } else {
            Err(NameError {
                name: raw.to_string(),
                rule: NameRule::Shape,
            })
        }
    }

    /// A variable name: `[a-z][a-z0-9_]*` after lowercasing.
    pub fn variable(raw: &str) -> Option<Name> {
        let name = normalise(raw);
        let mut chars = name.chars();
        let valid = chars.next().is_some_and(|c| c.is_ascii_lowercase())
            && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
        valid.then_some(Name(name))
    }

    /// A name read back from disk, which must already be lowercase and
    /// shaped. Unlike [`Name::shaped`] it does not lowercase.
    pub(crate) fn stored(raw: &str) -> Option<Name> {
        is_name_shaped(raw).then(|| Name(raw.to_string()))
    }

    /// The `default` character.
    pub(crate) fn default_character() -> Name {
        Name(crate::characters::DEFAULT.to_string())
    }

    /// The name as text.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The name as an owned `String`.
    pub fn into_string(self) -> String {
        self.0
    }
}

impl std::fmt::Display for Name {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Checks a preset name and returns its stored (lowercase) form.
pub fn validate_name(raw: &str) -> Result<String, NameError> {
    Name::preset(raw).map(Name::into_string)
}

/// The stored form of a name: lowercase. Names are lowercased here, not with
/// ad hoc `to_lowercase` calls (command-word matching and completion
/// prefixes are not names and lowercase on their own).
pub(crate) fn normalise(raw: &str) -> String {
    raw.to_lowercase()
}

/// Whether `name` matches `[a-z][a-z0-9_-]*`.
pub(crate) fn is_name_shaped(name: &str) -> bool {
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}
