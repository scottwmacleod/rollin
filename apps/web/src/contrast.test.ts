import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../../vendor/sm-core/sm-core.css"), "utf8").replace(
  /\r\n/g,
  "\n",
);

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in sm-core.css`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--sm-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]),
  );
}

type RGB = [number, number, number];
function parse(value: string): { rgb: RGB; a: number } {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const m = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) throw new Error(`cannot read colour ${value}`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
}
function over(top: string, under: RGB): RGB {
  const { rgb, a } = parse(top);
  return rgb.map((c, i) => c * a + (under[i] ?? 0) * (1 - a)) as RGB;
}
function lum([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: RGB, b: RGB): number {
  const [hi = 0, lo = 0] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes: Record<string, Record<string, string>> = {
  dark: block(':root,\n[data-theme="dark"]'),
  light: block('[data-theme="light"]'),
};

describe.each(Object.entries(themes))("%s theme contrast", (_name, t) => {
  const colour = (k: string): string => {
    const v = t[k];
    if (!v) throw new Error(`token --${k} is missing`);
    return v;
  };
  const rgb = (k: string) => parse(colour(k)).rgb;
  const ground = rgb("ground");
  const pairs: [string, RGB, RGB][] = [
    ["ink on ground", rgb("ink"), ground],
    ["ink-body on ground", rgb("ink-body"), ground],
    ["ink-muted on ground", rgb("ink-muted"), ground],
    ["ink on surface", rgb("ink"), rgb("surface")],
    ["ink-muted on surface", rgb("ink-muted"), rgb("surface")],
    ["signal-ink on ground", rgb("signal-ink"), ground],
    ["danger on ground", rgb("danger"), ground],
    ["on-signal on signal", rgb("on-signal"), rgb("signal")],
    ["danger on danger-tint", rgb("danger"), over(colour("danger-tint"), ground)],
  ];
  it.each(pairs)("%s is at least 4.5:1", (_label, fg, back) => {
    expect(ratio(fg, back)).toBeGreaterThanOrEqual(4.5);
  });
});
