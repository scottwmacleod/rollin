//! Generates `ui/tokens.css` from `ui/tokens.json`.

use serde::Deserialize;
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::Path;

const HEADER: &str =
    "/* Rollin — generated from tokens.json. Edit tokens.json, then regenerate. */\n\
/* Dark is the default; light follows the OS unless [data-theme] forces one. */\n";

/// Type styles whose usage calls for tabular numbers.
const TABULAR: &[&str] = &["total"];

#[derive(Deserialize)]
struct Doc {
    color: Color,
    #[serde(rename = "type")]
    typography: Typography,
    spacing: Simple,
    radius: Simple,
    size: Simple,
    motion: Motion,
}

#[derive(Deserialize)]
struct Color {
    themes: Vec<Theme>,
    tokens: Vec<ColorToken>,
}

#[derive(Deserialize)]
struct Theme {
    id: String,
}

#[derive(Deserialize)]
struct ColorToken {
    name: String,
    value: BTreeMap<String, String>,
}

#[derive(Deserialize)]
struct Typography {
    families: BTreeMap<String, String>,
    groups: Vec<Group>,
}

#[derive(Deserialize)]
struct Group {
    family: String,
    styles: Vec<Style>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Style {
    name: String,
    font_size: String,
    line_height: String,
    font_weight: u32,
    letter_spacing: Option<String>,
}

#[derive(Deserialize)]
struct Simple {
    tokens: Vec<Plain>,
}

#[derive(Deserialize)]
struct Plain {
    name: String,
    value: String,
}

#[derive(Deserialize)]
struct Motion {
    tokens: Vec<MotionToken>,
}

#[derive(Deserialize)]
struct MotionToken {
    name: String,
    value: String,
    reduced: String,
}

fn color_block(doc: &Doc, theme: &str, indent: &str) -> Result<String, String> {
    let mut out = format!("{indent}color-scheme: {theme};\n");
    for t in &doc.color.tokens {
        let v = t
            .value
            .get(theme)
            .ok_or_else(|| format!("color token `{}` has no `{theme}` value", t.name))?;
        writeln!(out, "{indent}--{}: {v};", t.name).unwrap();
    }
    Ok(out)
}

/// Turn the contents of `tokens.json` into the contents of `tokens.css`.
pub fn generate(json: &str) -> Result<String, String> {
    let doc: Doc = serde_json::from_str(json).map_err(|e| format!("tokens.json: {e}"))?;
    let ids: Vec<&str> = doc.color.themes.iter().map(|t| t.id.as_str()).collect();
    if ids != ["dark", "light"] {
        return Err(format!(
            "tokens.json: expected themes dark, light; got {ids:?}"
        ));
    }

    let mut css = String::from(HEADER);
    css.push('\n');
    write!(
        css,
        ":root,\n[data-theme=\"dark\"] {{\n{}}}\n\n",
        color_block(&doc, "dark", "  ")?
    )
    .unwrap();
    write!(
        css,
        "@media (prefers-color-scheme: light) {{\n  :root:not([data-theme=\"dark\"]) {{\n{}  }}\n}}\n\n",
        color_block(&doc, "light", "    ")?
    )
    .unwrap();
    write!(
        css,
        "[data-theme=\"light\"] {{\n{}}}\n\n",
        color_block(&doc, "light", "  ")?
    )
    .unwrap();

    css.push_str(":root {\n");
    for name in ["sans", "mono"] {
        let fam = doc
            .typography
            .families
            .get(name)
            .ok_or_else(|| format!("tokens.json: missing font family `{name}`"))?;
        writeln!(css, "  --font-{name}: {fam};").unwrap();
    }
    for t in doc
        .spacing
        .tokens
        .iter()
        .chain(&doc.radius.tokens)
        .chain(&doc.size.tokens)
    {
        writeln!(css, "  --{}: {};", t.name, t.value).unwrap();
    }
    for t in &doc.motion.tokens {
        writeln!(css, "  --{}: {};", t.name, t.value).unwrap();
    }
    css.push_str("}\n\n");

    for g in &doc.typography.groups {
        if !doc.typography.families.contains_key(&g.family) {
            return Err(format!("tokens.json: unknown font family `{}`", g.family));
        }
        for s in &g.styles {
            write!(
                css,
                ".t-{} {{ font-family: var(--font-{}); font-size: {}; line-height: {}; font-weight: {};",
                s.name, g.family, s.font_size, s.line_height, s.font_weight
            )
            .unwrap();
            if let Some(ls) = &s.letter_spacing {
                write!(css, " letter-spacing: {ls};").unwrap();
            }
            if TABULAR.contains(&s.name.as_str()) {
                css.push_str(" font-variant-numeric: tabular-nums;");
            }
            css.push_str(" }\n");
        }
    }

    css.push_str("\n@media (prefers-reduced-motion: reduce) {\n");
    for t in &doc.motion.tokens {
        writeln!(css, "  :root {{ --{}: {}; }}", t.name, t.reduced).unwrap();
    }
    css.push_str("}\n");
    Ok(css)
}

fn paths(root: &Path) -> (std::path::PathBuf, std::path::PathBuf) {
    (root.join("ui/tokens.json"), root.join("ui/tokens.css"))
}

fn fresh(root: &Path) -> Result<String, String> {
    let (json, _) = paths(root);
    let src = std::fs::read_to_string(&json).map_err(|e| format!("{}: {e}", json.display()))?;
    generate(&src)
}

/// Regenerate `ui/tokens.css` under `root`.
pub fn write(root: &Path) -> Result<(), String> {
    let css = fresh(root)?;
    let (_, out) = paths(root);
    std::fs::write(&out, css).map_err(|e| format!("{}: {e}", out.display()))
}

/// Fail if `ui/tokens.css` under `root` differs from a fresh generation.
pub fn check(root: &Path) -> Result<(), String> {
    let want = fresh(root)?;
    let (_, out) = paths(root);
    let have = std::fs::read_to_string(&out).map_err(|e| format!("{}: {e}", out.display()))?;
    if have == want {
        Ok(())
    } else {
        Err("ui/tokens.css is out of date with ui/tokens.json; run `just tokens`".to_string())
    }
}
