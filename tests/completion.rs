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

#[test]
fn char_completes_subcommands_and_character_names() {
    expect("char ", 5, &["default", "delete", "grog", "new"]);
    expect("char g", 5, &["grog"]);
    expect("char n", 5, &["new"]);
    expect("char delete ", 12, &["default", "grog"]);
    expect("char delete g", 12, &["grog"]);
    expect("char new g", 9, &[]);
    expect("--char ", 7, &["default", "grog"]);
    expect("--char g", 7, &["grog"]);
    expect("--char grog roll a", 17, &["atk"]);
    expect("--seed ", 7, &[]);
    expect("--color ", 8, &[]);
}

#[test]
fn set_and_unset_complete_variable_names_without_the_at_sign() {
    expect("set ", 4, &["dex", "stealth", "str"]);
    expect("set st", 4, &["stealth", "str"]);
    expect("unset D", 6, &["dex"]);
    expect("set str ", 8, &[]);
    expect("unset str d", 10, &[]);
}

#[test]
fn an_at_sign_completes_variables_anywhere_with_the_at_prefix() {
    expect("@", 0, &["@dex", "@stealth", "@str"]);
    expect("@st", 0, &["@stealth", "@str"]);
    expect("@D", 0, &["@dex"]);
    expect("d20+@st", 4, &["@stealth", "@str"]);
    expect("roll d20+@d", 9, &["@dex"]);
    expect("d20+@str+@d", 9, &["@dex"]);
    expect("4d6kh@s", 5, &["@stealth", "@str"]);
    expect("d20 # attack @", 13, &["@dex", "@stealth", "@str"]);
    expect("d20+@st+", 0, &[]);
    expect("@zzz", 0, &[]);
}
