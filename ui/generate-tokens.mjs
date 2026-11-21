import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEADER =
  "/* rollin: generated from ui/tokens.json. Edit tokens.json, then regenerate. */\n" +
  "/* Product sizes only; everything else comes from sm-core. */\n";

export function generate(json) {
  const doc = JSON.parse(json);
  const names = new Set();
  let css = `${HEADER}\n:root {\n`;
  for (const t of doc.size.tokens) {
    if (!/^[a-z][a-z0-9-]*$/.test(t.name)) throw new Error(`tokens.json: bad token name \`${t.name}\``);
    if (names.has(t.name)) throw new Error(`tokens.json: duplicate token \`${t.name}\``);
    names.add(t.name);
    css += `  --rollin-${t.name}: ${t.value};\n`;
  }
  return `${css}}\n`;
}

const here = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(here, "tokens.json");
const cssPath = resolve(here, "tokens.css");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const want = generate(readFileSync(jsonPath, "utf8"));
  if (process.argv.includes("--check")) {
    const have = readFileSync(cssPath, "utf8");
    if (have !== want) {
      console.error("ui/tokens.css is out of date with ui/tokens.json; run `bun run tokens`");
      process.exit(1);
    }
  } else {
    writeFileSync(cssPath, want);
    console.log("wrote ui/tokens.css");
  }
}
