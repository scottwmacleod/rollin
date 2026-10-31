//! Tab completion as a pure function: no I/O, so it is tested directly. The
//! binary builds a [`CompletionData`] from the store and hands the result to
//! the line editor.

/// The names completion can offer.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CompletionData {
    /// Preset names the active character can roll: its own first, then global.
    pub presets: Vec<String>,
    /// Every character name.
    pub characters: Vec<String>,
    /// The active character's variable names (without `@`).
    pub variables: Vec<String>,
    /// Words only the session understands (`help`, `quit`, ...).
    pub session_words: Vec<String>,
}

/// Where the word being completed starts, and what it could become.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Completion {
    /// Byte offset in the line where the replacement starts (at most the
    /// cursor, on a character boundary).
    pub start: usize,
    /// Sorted, de-duplicated replacements for `line[start..pos]`.
    pub candidates: Vec<String>,
}

/// The words the command parser knows (the session-only ones come in
/// [`CompletionData::session_words`]).
const COMMANDS: [&str; 10] = [
    "save",
    "presets",
    "delete",
    "import",
    "roll",
    "set",
    "unset",
    "vars",
    "char",
    "characters",
];

/// Completes the word ending at byte offset `pos` of `line`. A `pos` past the
/// end, or inside a character, is moved back to the nearest boundary.
pub fn complete(line: &str, pos: usize, data: &CompletionData) -> Completion {
    let mut pos = pos.min(line.len());
    while !line.is_char_boundary(pos) {
        pos -= 1;
    }
    let before = &line[..pos];
    let start = before.rfind(char::is_whitespace).map_or(0, |i| {
        i + before[i..].chars().next().map_or(1, char::len_utf8)
    });
    let typed = &line[start..pos];
    if let Some(at) = typed.rfind('@') {
        let run = &typed[at + 1..];
        if run.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            let names: Vec<String> = data.variables.iter().map(|v| format!("@{v}")).collect();
            return Completion {
                start: start + at,
                candidates: matching(
                    &names.iter().map(String::as_str).collect::<Vec<_>>(),
                    &typed[at..],
                ),
            };
        }
    }
    if typed.starts_with('-') {
        return Completion {
            start,
            candidates: matching(&FLAGS, typed),
        };
    }
    let (words, pending) = positional_words(&before[..start]);
    let chars = || {
        data.characters
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
    };
    let presets = || data.presets.iter().map(String::as_str).collect::<Vec<_>>();
    let names: Vec<&str> = match words.as_slice() {
        _ if pending == Some("--char") => chars(),
        _ if pending.is_some() => Vec::new(),
        [] => {
            let mut names: Vec<&str> = COMMANDS.to_vec();
            names.extend(data.session_words.iter().map(String::as_str));
            names.extend(presets());
            names
        }
        [command] if command == "roll" || command == "delete" => presets(),
        [command] if command == "char" => {
            let mut names = chars();
            names.extend(["new", "delete"]);
            names
        }
        [command] if command == "set" || command == "unset" => {
            data.variables.iter().map(String::as_str).collect()
        }
        [command, sub] if command == "char" && sub == "delete" => chars(),
        _ => Vec::new(),
    };
    Completion {
        start,
        candidates: matching(&names, typed),
    }
}

/// The long flags, offered when a word starts with a dash.
const FLAGS: [&str; 7] = [
    "--seed", "--json", "--color", "--char", "--global", "--force", "--quiet",
];

/// Flags that take a value in the next word.
const VALUE_FLAGS: [&str; 3] = ["--seed", "--char", "--color"];

/// The lowercase words before the cursor that are not flags or flag values,
/// and the value flag the cursor's word is the value of, if any.
fn positional_words(before: &str) -> (Vec<String>, Option<&'static str>) {
    let mut words = Vec::new();
    let mut pending = None;
    for word in before.split_whitespace() {
        let word = word.to_lowercase();
        if pending.take().is_some() {
            continue;
        }
        if word.starts_with('-') {
            pending = VALUE_FLAGS.iter().copied().find(|f| *f == word);
        } else {
            words.push(word);
        }
    }
    (words, pending)
}

/// The names that extend `typed` (ignoring case), sorted and de-duplicated.
fn matching(names: &[&str], typed: &str) -> Vec<String> {
    let typed = typed.to_lowercase();
    let mut out: Vec<String> = names
        .iter()
        .filter(|n| n.to_lowercase().starts_with(&typed))
        .map(|n| n.to_string())
        .collect();
    out.sort();
    out.dedup();
    out
}
