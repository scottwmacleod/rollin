//! `ui/tokens.css` is generated from `ui/tokens.json`; fail on hand edits.
//! Fix with `just tokens`.

use std::path::Path;

#[test]
fn tokens_css_matches_a_fresh_generation_from_tokens_json() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    if let Err(e) = xtask::tokens::check(root) {
        panic!("{e}");
    }
}
