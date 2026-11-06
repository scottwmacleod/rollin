import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Normalise CRLF: Windows checkouts convert line endings and the selectors below contain "\n".
const css = readFileSync(resolve(__dirname, "../generated/tokens.css"), "utf8").replace(/\r\n/g, "\n");

// Text pairs the log uses must meet 4.5:1 in both themes (design system notes).

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
}

type RGB = [number, number, number];
function parse(value: string): { rgb: RGB; a: number } {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const m = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)!;
  return { rgb: [+m[1], +m[2], +m[3]], a: +m[4] };
}
function over(top: string, under: RGB): RGB {
  const { rgb, a } = parse(top);
  return rgb.map((c, i) => c * a + under[i] * (1 - a)) as RGB;
}
function lum([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes: Record<string, Record<string, string>> = {
  dark: block(':root,\n[data-theme="dark"]'),
  light: block('[data-theme="light"]'),
};

describe.each(Object.entries(themes))("%s theme contrast", (_name, t) => {
  const bg = parse(t.bg).rgb;
  const tint = over(t["danger-tint"], bg);
  const rgb = (k: string) => parse(t[k]).rgb;
  const pairs: [string, RGB, RGB][] = [
    ["text on bg", rgb("text"), bg],
    ["text-2 on bg", rgb("text-2"), bg],
    ["muted on bg", rgb("muted"), bg],
    ["signal-ink on bg", rgb("signal-ink"), bg],
    ["danger on bg", rgb("danger"), bg],
    ["on-signal on signal", rgb("on-signal"), rgb("signal")],
    ["danger on danger-tint", rgb("danger"), tint],
  ];
  it.each(pairs)("%s is at least 4.5:1", (_label, fg, back) => {
    expect(ratio(fg, back)).toBeGreaterThanOrEqual(4.5);
  });
});
