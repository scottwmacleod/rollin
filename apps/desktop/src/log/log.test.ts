import { describe, expect, it } from "vitest";
import { breakdown, totalText } from "./breakdown";
import { caretLines } from "./caret";
import { renderEntry } from "./entry";
import { mountLog } from "./index";
import { natural } from "./natural";
import type { Die, LogEntry, Roll, RollDocument } from "./types";

interface Fixture {
  formula: string;
  seed: number;
  expected: RollDocument;
}

const files = import.meta.glob<Fixture>("../../../../tests/fixtures/golden/*.json", {
  eager: true,
  import: "default",
});
const fixtures = Object.entries(files).map(([path, f]) => ({
  name: path.split("/").pop()!,
  ...f,
}));

const time = new Date(2026, 10, 4, 9, 5, 7);

function entryFor(f: { formula: string; expected: RollDocument }): LogEntry {
  return { id: f.formula, time, input: f.formula, result: { ok: true, doc: f.expected } };
}

function fixture(name: string): Fixture {
  const f = fixtures.find((x) => x.name === name);
  if (!f) throw new Error(`missing fixture ${name}`);
  return f;
}

function render(f: Fixture): HTMLElement {
  return renderEntry(entryFor(f));
}

describe("golden fixtures", () => {
  it("found the fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(40);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))("renders %s", (_name, f) => {
    const node = render(f);
    const rows = node.querySelectorAll(".roll-row");
    expect(rows).toHaveLength(f.expected.rolls.length);
    f.expected.rolls.forEach((roll, i) => {
      const row = rows[i];
      expect(row.querySelector(".roll-total")!.textContent).toBe(totalText(roll));
      expect(row.querySelector(".roll-formula-text")!.textContent).toBe(roll.formula);
      expect(row.querySelector(".roll-iteration")!.textContent).toBe(
        roll.iteration === undefined ? "" : String(roll.iteration),
      );
      if (roll.label) expect(row.querySelector(".roll-label")!.textContent).toBe(`# ${roll.label}`);
    });
    expect(node.querySelector(".entry-time")!.textContent).toBe("09:05:07");
    expect(node.querySelector(".entry-input")!.textContent).toBe(`› ${f.formula}`);
  });
});

function dieTexts(node: HTMLElement, state: string): string[] {
  return [...node.querySelectorAll(`.die-${state}`)].map(
    (d) => d.firstChild!.textContent ?? "",
  );
}

describe("die glyphs", () => {
  it("shows kept dice plainly and dropped dice in parentheses", () => {
    const node = render(fixture("4d6dl1-seed3.json"));
    expect(node.querySelector(".roll-breakdown")!.textContent).toContain("[(1)");
    expect(dieTexts(node, "dropped")).toEqual(["(1)"]);
  });

  it("strikes a rerolled die and marks its replacement with ↻", () => {
    const node = render(fixture("reasons-reroll-seed3.json"));
    expect(dieTexts(node, "rerolled")).toEqual(["1", "1", "1"]);
    expect(dieTexts(node, "replacement")).toEqual(["↻4", "↻6", "↻5"]);
  });

  it("marks successes ✓ and failures ✗", () => {
    const node = render(fixture("count-failure-seed2.json"));
    expect(dieTexts(node, "success")).toEqual(["9✓"]);
    expect(dieTexts(node, "failure")).toEqual(["1✗"]);
    expect(node.querySelector(".roll-total")!.textContent).toBe("0 successes");
    expect(node.querySelector<HTMLElement>(".roll-total")!.title).toBe("0 successes (1 - 1 failure)");
  });

  it("marks exploded dice with !", () => {
    const node = render(fixture("explode-plain-seed2.json"));
    expect(dieTexts(node, "exploded").length).toBeGreaterThan(0);
    for (const t of dieTexts(node, "exploded")) expect(t).toMatch(/!$/);
  });

  it("gives a natural 20 a chip and a natural 1 an outline, only on a lone d20", () => {
    const nat20 = doc("d20", [{ value: 20, status: "kept" }], 20);
    const nat1 = doc("d20+5", [{ value: 1, status: "kept" }], 1, 5);
    expect(dieTexts(renderEntry(nat20), "nat20")).toEqual(["20"]);
    expect(dieTexts(renderEntry(nat1), "nat1")).toEqual(["1"]);
    expect(renderEntry(nat20).textContent).toContain("natural 20");

    const two = doc("2d20kh1", [
      { value: 20, status: "kept" },
      { value: 3, status: "dropped" },
    ], 20);
    expect(renderEntry(two).querySelector(".die-nat20")).toBeNull();
  });

  it("applies the lone d20 rule of render.rs", () => {
    const d = (value: number) => ({ value, status: "kept" as const });
    const dice = (sides: number, ...vals: number[]) => ({
      type: "dice" as const,
      term: "x",
      sides,
      dice: vals.map(d),
      subtotal: 0,
    });
    expect(natural(dice(20, 20))).toBe("twenty");
    expect(natural(dice(20, 1))).toBe("one");
    expect(natural(dice(20, 7))).toBeNull();
    expect(natural(dice(12, 12))).toBeNull();
    expect(natural(dice(20, 20, 20))).toBeNull();
    const times = {
      type: "chain" as const,
      first: dice(20, 20),
      rest: [{ op: "*" as const, node: { type: "number" as const, value: 2 } }],
      total: 40,
    };
    expect(natural(times)).toBeNull();
    const twoGroups = {
      ...times,
      rest: [{ op: "+" as const, node: dice(20, 20) }],
    };
    expect(natural(twoGroups)).toBeNull();
  });

  it("never relies on colour alone: every non-plain die carries a mark or spoken text", () => {
    for (const f of fixtures) {
      for (const roll of f.expected.rolls) {
        for (const cell of breakdown(roll)) {
          if (cell.type === "die" && cell.state !== "kept") {
            expect(cell.spoken).not.toBe("");
          }
        }
      }
    }
  });
});

function doc(formula: string, dice: Die[], value: number, add = 0): LogEntry {
  const dnode = { type: "dice", term: formula, sides: 20, dice, subtotal: value };
  const expr: unknown = add
    ? { type: "chain", first: dnode, rest: [{ op: "+", node: { type: "number", value: add } }], total: value + add }
    : dnode;
  return {
    id: formula,
    time,
    input: formula,
    result: {
      ok: true,
      doc: { schema_version: 1, rolls: [{ formula, total: value + add, expr: expr as Roll["expr"] }] },
    },
  };
}

describe("entries", () => {
  it("shows the preset expansion in the header", () => {
    const f = fixture("d20-seed1.json");
    const node = renderEntry({
      ...entryFor(f),
      input: "adv-attack",
      preset: { name: "adv-attack", expansion: "d20adv+5" },
    });
    expect(node.querySelector(".entry-preset")!.textContent).toBe(
      "(preset 'adv-attack': d20adv+5)",
    );
  });

  it("renders an error with the CLI message and caret line", () => {
    const node = renderEntry({
      id: 1,
      time,
      input: "2d6 + x",
      result: { ok: false, message: "unexpected 'x'", source: "2d6 + x", span: [6, 7] },
    });
    expect(node.classList.contains("entry-error")).toBe(true);
    expect(node.querySelector(".error-message")!.textContent).toBe("error: unexpected 'x'");
    expect(node.querySelector(".error-caret")!.textContent).toBe("  2d6 + x\n        ^");
  });

  it("maps byte spans to character columns", () => {
    // "é" is two bytes: the span of the 'x' is bytes 3..4, column 2.
    expect(caretLines("é+x", [3, 4])).toEqual(["é+x", "  ^"]);
    expect(caretLines("a\nb", [2, 3])[0]).toBe("a b");
  });
});

describe("mountLog", () => {
  it("is a polite live region, appends at the bottom and fades new entries in", () => {
    const host = document.createElement("main");
    const log = mountLog(host);
    expect(host.getAttribute("aria-live")).toBe("polite");
    log.append(entryFor(fixture("d20-seed1.json")));
    log.append(entryFor(fixture("d20-seed42.json")));
    const entries = host.querySelectorAll(".log-entry");
    expect(entries).toHaveLength(2);
    expect(entries[1].getAttribute("data-entry-id")).toBe("d20");
    expect(entries[1].classList.contains("entering")).toBe(true);
    log.setCompact(true);
    expect(host.hasAttribute("data-compact")).toBe(true);
    log.clear();
    expect(host.querySelectorAll(".log-entry")).toHaveLength(0);
  });
});
