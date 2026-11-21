import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASELINE = "comments-baseline.json";
const NEVER_SCANNED = ["vendor/sm-core/", "node_modules/"];
const GENERATED = /(^|\/)(worker-configuration\.d\.ts|[^/]+\.gen\.[cm]?[jt]sx?)$/;

const JS_DIRECTIVE =
  /^[*!\s]*(biome-ignore|@ts-expect-error|@ts-ignore|@ts-nocheck|@ts-check|eslint-|@vitest-environment|@jsxImportSource|@jsx |[cv]8 ignore|istanbul ignore|@vite-ignore|[#@]__PURE__|prettier-ignore|webpack[A-Z]|\/ <reference )/;
const HASH_DIRECTIVE = /^#\s*(yaml-language-server:|shellcheck |v?\d+(\.\d+)*\s*$)/;
const ACTION_PIN = /@[0-9a-f]{40}\s+#/;

const JS = /\.(c|m)?(j|t)sx?$|\.jsonc?$|\.json5$/;
const CSS = /\.(s?css|less)$/;
const HTML = /\.html?$/;
const HASH = /\.(ya?ml|sh|bash|toml)$|(^|\/)[^./]+$/;

const REGEX_AFTER = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_KEYWORDS = /(^|[^\w$.])(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/;

function lexJs(src, from, to, out, { slashSlash = true, inTemplate = false } = {}) {
  const stack = [];
  let i = from;
  let last = "";
  let lastWordEnd = from;
  const startsRegex = () =>
    last === "" || REGEX_AFTER.has(last) || REGEX_KEYWORDS.test(src.slice(Math.max(from, lastWordEnd - 12), lastWordEnd));
  while (i < to) {
    const c = src[i];
    const n = src[i + 1];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (slashSlash && c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 || end > to ? to : end;
      out.push([i, stop]);
      i = stop;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 || end + 2 > to ? to : end + 2;
      out.push([i, stop]);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < to && src[i] !== c && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i++;
      last = c;
      continue;
    }
    if (c === "`") {
      i = template(src, i + 1, to, out);
      last = c;
      continue;
    }
    if (slashSlash && c === "/" && startsRegex()) {
      i++;
      let inClass = false;
      while (i < to && src[i] !== "\n" && (inClass || src[i] !== "/")) {
        if (src[i] === "\\") i++;
        else if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] ?? "")) i++;
      last = "/regex";
      continue;
    }
    if (c === "{") stack.push(c);
    if (c === "}") {
      if (!stack.length && inTemplate) return i + 1;
      stack.pop();
    }
    last = c;
    if (/[\w$]/.test(c)) {
      while (i < to && /[\w$]/.test(src[i])) i++;
      lastWordEnd = i;
      last = "w";
      continue;
    }
    i++;
  }
  return i;
}

function template(src, i, to, out) {
  while (i < to && src[i] !== "`") {
    if (src[i] === "\\") i += 2;
    else if (src[i] === "$" && src[i + 1] === "{") i = lexJs(src, i + 2, to, out, { inTemplate: true });
    else i++;
  }
  return i + 1;
}

function lexHash(src, out) {
  let lineStart = 0;
  for (const line of src.split("\n")) {
    let quote = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === "\\" && quote === '"') i++;
        else if (c === quote) quote = "";
      } else if ((c === '"' || c === "'") && (i === 0 || /[\s:=([{,]/.test(line[i - 1]))) {
        quote = c;
      } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        const pinned = ACTION_PIN.test(line.slice(0, i + 1));
        const shebang = lineStart === 0 && i === 0 && line[1] === "!";
        if (!shebang && !(pinned && HASH_DIRECTIVE.test(line.slice(i)))) out.push([lineStart + i, lineStart + line.length]);
        break;
      }
    }
    lineStart += line.length + 1;
  }
}

function lexHtml(src, out) {
  const block = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of src.matchAll(block)) {
    if (m[0].startsWith("<!--")) out.push([m.index, m.index + m[0].length]);
    else {
      const start = m.index + m[0].indexOf(">") + 1;
      lexJs(src, start, start + m[2].length, out, { slashSlash: m[1].toLowerCase() === "script" });
    }
  }
}

function allowed(text) {
  if (text.startsWith("#")) return HASH_DIRECTIVE.test(text);
  return JS_DIRECTIVE.test(text.replace(/^(\/\/|\/\*)/, ""));
}

export function findComments(path, src) {
  const spans = [];
  if (JS.test(path)) lexJs(src.startsWith("#!") ? src.replace(/^#!.*/, (s) => " ".repeat(s.length)) : src, 0, src.length, spans);
  else if (CSS.test(path)) lexJs(src, 0, src.length, spans, { slashSlash: false });
  else if (HTML.test(path)) lexHtml(src, spans);
  else if (HASH.test(path) && (/\.\w+$/.test(path) || /^#!.*\b(sh|bash)\b/.test(src))) lexHash(src, spans);
  else return null;

  const lineOf = (i) => src.slice(0, i).split("\n").length;
  const kept = spans.filter(([s, e]) => !allowed(src.slice(s, e)));
  const masked = [...src];
  for (const [s, e] of kept) for (let i = s; i < e; i++) if (masked[i] !== "\n") masked[i] = " ";
  const maskedLines = masked.join("").split("\n");
  const touched = new Set();
  const comments = kept.map(([s, e]) => {
    const line = lineOf(s);
    const endLine = lineOf(Math.max(s, e - 1));
    for (let l = line; l <= endLine; l++) touched.add(l);
    return { line, endLine, text: src.slice(s, e).split("\n")[0].trim() };
  });
  const shed = [...touched].filter((l) => maskedLines[l - 1].trim() === "").length;
  return { comments, lines: touched.size, shed };
}

function scan(ignore) {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  const skip = [...NEVER_SCANNED, ...ignore];
  const results = {};
  for (const path of listed.split("\n")) {
    if (!path || skip.some((p) => path.startsWith(p)) || GENERATED.test(path) || !existsSync(path)) continue;
    const found = findComments(path, readFileSync(path, "utf8"));
    if (found?.lines) results[path] = found;
  }
  return results;
}

function biomeJson(ignore, files) {
  const inline = `  "ignore": [${ignore.map((p) => JSON.stringify(p)).join(", ")}],`;
  const ignoreLines =
    inline.length <= 100 ? [inline] : ['  "ignore": [', ...ignore.map((p, i) => `    ${JSON.stringify(p)}${i < ignore.length - 1 ? "," : ""}`), "  ],"];
  const entries = Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1));
  const fileLines = entries.length
    ? ['  "files": {', ...entries.map(([p, n], i) => `    ${JSON.stringify(p)}: ${n}${i < entries.length - 1 ? "," : ""}`), "  }"]
    : ['  "files": {}'];
  return `${["{", ...ignoreLines, ...fileLines, "}"].join("\n")}\n`;
}

function main(args) {
  const hasBaseline = existsSync(BASELINE);
  const baseline = hasBaseline ? JSON.parse(readFileSync(BASELINE, "utf8")) : { ignore: [], files: {} };
  const ignore = baseline.ignore ?? [];
  const allowedLines = Object.fromEntries(
    Object.entries(baseline.files ?? {}).filter(([p]) => !ignore.some((i) => p.startsWith(i))),
  );
  const results = scan(ignore);
  const counts = Object.fromEntries(Object.entries(results).map(([p, r]) => [p, r.lines]));
  const save = (files) => writeFileSync(BASELINE, biomeJson(ignore, files));

  if (args.includes("--report")) {
    const total = Object.values(results).reduce((n, r) => n + r.lines, 0);
    const shed = Object.values(results).reduce((n, r) => n + r.shed, 0);
    for (const [p, r] of Object.entries(results)) console.log(`${String(r.lines).padStart(5)}  ${p}`);
    console.log(`${total} comment lines in ${Object.keys(results).length} files; deleting them all sheds ${shed} lines.`);
    return 0;
  }

  if (args.includes("--init")) {
    if (hasBaseline) {
      console.error(`${BASELINE} already exists. Use --update to lower it.`);
      return 1;
    }
    save(counts);
    console.log(`Wrote ${BASELINE}: ${Object.keys(counts).length} files may keep their comments, and no more.`);
    return 0;
  }

  const over = Object.keys(counts).filter((p) => counts[p] > (allowedLines[p] ?? 0));
  const under = Object.keys(allowedLines).filter((p) => (counts[p] ?? 0) < allowedLines[p]);

  if (over.length) {
    console.error("✗ New comments. Put the reason in a name, a test, an ADR or the PR instead:");
    for (const p of over) {
      for (const c of results[p].comments) console.error(`  ${p}:${c.line}  ${c.text}`);
      console.error(`  (${p} may have ${allowedLines[p] ?? 0} comment lines, has ${counts[p]})`);
    }
    if (args.includes("--update")) console.error(`--update only lowers ${BASELINE}; it never raises it.`);
    return 1;
  }

  if (args.includes("--update")) {
    save(counts);
    console.log(`✓ ${BASELINE} lowered to ${Object.values(counts).reduce((a, b) => a + b, 0)} comment lines.`);
    return 0;
  }

  if (under.length) {
    console.error(`✗ Comments were deleted (${under.join(", ")}). Lock that in: run this again with --update and commit ${BASELINE}.`);
    return 1;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`✓ no new comments (${total} comment lines left in the baseline)`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
