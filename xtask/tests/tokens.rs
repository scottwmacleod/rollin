use xtask::tokens::generate;

const MINI: &str = r##"{
  "color": {
    "themes": [{"id": "dark"}, {"id": "light"}],
    "tokens": [
      {"name": "bg", "value": {"dark": "#000", "light": "#fff"}},
      {"name": "ink", "value": {"dark": "#111", "light": "#222"}}
    ]
  },
  "type": {
    "families": {"sans": "Sans, sans-serif", "mono": "Mono, monospace"},
    "groups": [
      {"family": "sans", "styles": [
        {"name": "ui", "fontSize": "13px", "lineHeight": "18px", "fontWeight": 400},
        {"name": "title", "fontSize": "15px", "lineHeight": "20px", "fontWeight": 600, "letterSpacing": "-0.01em"}
      ]},
      {"family": "mono", "styles": [
        {"name": "total", "fontSize": "15px", "lineHeight": "20px", "fontWeight": 600}
      ]}
    ]
  },
  "spacing": {"tokens": [{"name": "space-1", "value": "4px"}]},
  "radius": {"tokens": [{"name": "radius-1", "value": "4px"}]},
  "size": {"tokens": [{"name": "size-icon", "value": "16px"}]},
  "motion": {"tokens": [{"name": "duration-enter", "value": "120ms", "reduced": "0ms"}]}
}"##;

#[test]
fn generates_the_documented_layout() {
    let css = generate(MINI).unwrap();
    assert!(css.starts_with("/* Rollin — generated from tokens.json."));
    assert!(css.contains(":root,\n[data-theme=\"dark\"] {\n  color-scheme: dark;\n  --bg: #000;\n  --ink: #111;\n}\n"));
    assert!(css.contains("@media (prefers-color-scheme: light) {\n  :root:not([data-theme=\"dark\"]) {\n    color-scheme: light;\n    --bg: #fff;\n    --ink: #222;\n  }\n}\n"));
    assert!(css.contains(
        "[data-theme=\"light\"] {\n  color-scheme: light;\n  --bg: #fff;\n  --ink: #222;\n}\n"
    ));
    assert!(css.contains(":root {\n  --font-sans: Sans, sans-serif;\n  --font-mono: Mono, monospace;\n  --space-1: 4px;\n  --radius-1: 4px;\n  --size-icon: 16px;\n  --duration-enter: 120ms;\n}\n"));
    assert!(css.contains(".t-ui { font-family: var(--font-sans); font-size: 13px; line-height: 18px; font-weight: 400; }\n"));
    assert!(css.contains("font-weight: 600; letter-spacing: -0.01em; }\n"));
    assert!(css.contains("font-weight: 600; font-variant-numeric: tabular-nums; }\n"));
    assert!(css.ends_with(
        "@media (prefers-reduced-motion: reduce) {\n  :root { --duration-enter: 0ms; }\n}\n"
    ));
}

#[test]
fn rejects_a_theme_value_that_is_missing() {
    let bad = MINI.replace(r##""light": "#222""##, r##""x": "#222""##);
    assert!(generate(&bad).is_err());
}

#[test]
fn check_reports_drift_and_write_fixes_it() {
    let dir = std::env::temp_dir().join(format!("xtask-tokens-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("ui")).unwrap();
    std::fs::write(dir.join("ui/tokens.json"), MINI).unwrap();
    std::fs::write(dir.join("ui/tokens.css"), "hand edited\n").unwrap();
    let err = xtask::tokens::check(&dir).unwrap_err();
    assert!(err.contains("just tokens"));
    xtask::tokens::write(&dir).unwrap();
    xtask::tokens::check(&dir).unwrap();
    std::fs::remove_dir_all(&dir).unwrap();
}
