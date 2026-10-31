mod common;

use common::Cli;

#[test]
fn version_is_2_0_0() {
    let run = Cli::new().run(&["--version"]);
    run.assert_success();
    assert_eq!(run.stdout.trim(), "rollin 2.0.1");
}

#[test]
fn help_includes_examples() {
    let run = Cli::new().run(&["--help"]);
    run.assert_success();
    assert!(run.stdout.contains("Examples:"), "{}", run.stdout);
    assert!(run.stdout.contains("rollin 4d6dl1"), "{}", run.stdout);
}

#[test]
fn every_help_example_runs_successfully() {
    let help = Cli::new().run(&["--help"]).stdout;
    let examples: Vec<&str> = help
        .lines()
        .filter_map(|l| l.trim_start().strip_prefix("$ rollin "))
        .map(|l| l.split("  ").next().unwrap().trim())
        .collect();
    assert!(examples.len() >= 8, "too few examples: {examples:?}");
    for ex in examples {
        // Run in order against one sandbox so `set`/`save` precede their uses.
        let words: Vec<String> = shell_words(ex);
        let refs: Vec<&str> = words.iter().map(String::as_str).collect();
        let cli = Cli::new();
        cli.run(&["set", "str", "3"]).assert_success();
        let run = cli.run(&refs);
        // `save`d presets are created by the examples themselves, so only
        // require that nothing fails on syntax.
        assert!(run.success(), "example `rollin {ex}` failed: {run:#?}");
    }
}

/// Minimal single/double-quote splitter for the example lines.
fn shell_words(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut any = false;
    for c in s.chars() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), c) => cur.push(c),
            (None, '\'' | '"') => {
                quote = Some(c);
                any = true;
            }
            (None, c) if c.is_whitespace() => {
                if any || !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                    any = false;
                }
            }
            (None, c) => cur.push(c),
        }
    }
    if any || !cur.is_empty() {
        out.push(cur);
    }
    out
}
