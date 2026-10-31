//! Tab completion as pure functions: a line, a cursor and the available names
//! in, a start offset and candidates out.

use rollin::{complete, Completion, CompletionData};

fn data() -> CompletionData {
    let list = |names: &[&str]| names.iter().map(|n| n.to_string()).collect();
    CompletionData {
        presets: list(&["atk", "sneak", "house"]),
        characters: list(&["default", "grog"]),
        variables: list(&["dex", "stealth", "str"]),
        session_words: list(&["help", "quit", "exit", "history"]),
    }
}

/// Completes at the end of `line`.
fn at_end(line: &str) -> Completion {
    complete(line, line.len(), &data())
}

fn expect(line: &str, start: usize, candidates: &[&str]) {
    let got = at_end(line);
    assert_eq!(
        (
            got.start,
            got.candidates
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
        ),
        (start, candidates.to_vec()),
        "completing {line:?}"
    );
}

#[test]
fn the_first_word_completes_to_commands_and_presets() {
    expect("s", 0, &["save", "set", "sneak"]);
    expect("S", 0, &["save", "set", "sneak"]);
    expect("h", 0, &["help", "history", "house"]);
    expect("zzz", 0, &[]);
}

#[test]
fn roll_and_delete_complete_preset_names() {
    expect("roll ", 5, &["atk", "house", "sneak"]);
    expect("roll s", 5, &["sneak"]);
    expect("ROLL A", 5, &["atk"]);
    expect("delete ", 7, &["atk", "house", "sneak"]);
    expect("delete --global h", 16, &["house"]);
    expect("--seed 3 roll a", 14, &["atk"]);
    expect("roll d20 +", 9, &[]);
}
