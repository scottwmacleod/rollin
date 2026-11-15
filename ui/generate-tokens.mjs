// Generates ui/tokens.css from ui/tokens.json.
//
//   node ui/generate-tokens.mjs          write ui/tokens.css
//   node ui/generate-tokens.mjs --check  fail if ui/tokens.css has drifted
//
// tokens.json is the source of truth; never hand-edit tokens.css.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEADER =
  "/* Rollin — generated from tokens.json. Edit tokens.json, then regenerate. */\n" +
  "/* Dark is the default; light follows the OS unless [data-theme] forces one. */\n";

// Type styles whose usage calls for tabular numbers.
const TABULAR = new Set(["total"]);

function colorBlock(doc, theme, indent) {
  let out = `${indent}color-scheme: ${theme};\n`;
  for (const t of doc.color.tokens) {
    const v = t.value[theme];
    if (v === undefined) throw new Error(`color token \`${t.name}\` has no \`${theme}\` value`);
    out += `${indent}--${t.name}: ${v};\n`;
  }
  return out;
}

/** Turn the contents of tokens.json into the contents of tokens.css. */
export function generate(json) {
  const doc = JSON.parse(json);
  const ids = doc.color.themes.map((t) => t.id);
  if (ids.join() !== "dark,light") {
    throw new Error(`tokens.json: expected themes dark, light; got ${ids.join(", ")}`);
  }

  let css = `${HEADER}\n`;
  css += `:root,\n[data-theme="dark"] {\n${colorBlock(doc, "dark", "  ")}}\n\n`;
  css += `@media (prefers-color-scheme: light) {\n  :root:not([data-theme="dark"]) {\n${colorBlock(doc, "light", "    ")}  }\n}\n\n`;
  css += `[data-theme="light"] {\n${colorBlock(doc, "light", "  ")}}\n\n`;

  css += ":root {\n";
  for (const name of ["sans", "mono"]) {
    const fam = doc.type.families[name];
    if (fam === undefined) throw new Error(`tokens.json: missing font family \`${name}\``);
    css += `  --font-${name}: ${fam};\n`;
  }
  for (const t of [...doc.spacing.tokens, ...doc.radius.tokens, ...doc.size.tokens]) {
    css += `  --${t.name}: ${t.value};\n`;
  }
  for (const t of doc.motion.tokens) css += `  --${t.name}: ${t.value};\n`;
  css += "}\n\n";

  for (const g of doc.type.groups) {
    if (!(g.family in doc.type.families)) {
      throw new Error(`tokens.json: unknown font family \`${g.family}\``);
    }
    for (const s of g.styles) {
      css += `.t-${s.name} { font-family: var(--font-${g.family}); font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight};`;
      if (s.letterSpacing != null) css += ` letter-spacing: ${s.letterSpacing};`;
      if (TABULAR.has(s.name)) css += " font-variant-numeric: tabular-nums;";
      css += " }\n";
    }
  }

  css += "\n@media (prefers-reduced-motion: reduce) {\n";
  for (const t of doc.motion.tokens) css += `  :root { --${t.name}: ${t.reduced}; }\n`;
  css += "}\n";
  return css;
}

const here = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(here, "tokens.json");
const cssPath = resolve(here, "tokens.css");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const want = generate(readFileSync(jsonPath, "utf8"));
  if (process.argv.includes("--check")) {
    const have = readFileSync(cssPath, "utf8");
    if (have !== want) {
      console.error("ui/tokens.css is out of date with ui/tokens.json; run `npm run tokens`");
      process.exit(1);
    }
  } else {
    writeFileSync(cssPath, want);
    console.log("wrote ui/tokens.css");
  }
}
