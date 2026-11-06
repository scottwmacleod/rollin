import { describe, expect, it, vi } from "vitest";
import { mountLog } from "./index";
import { dieTree } from "./tree";
import type { LogEntry, RollDocument } from "./types";

interface Fixture {
  formula: string;
  expected: RollDocument;
}
const files = import.meta.glob<Fixture>("../../../../tests/fixtures/golden/*.json", {
  eager: true,
  import: "default",
});
const fixtures = Object.entries(files).map(([p, f]) => ({ name: p.split("/").pop()!, ...f }));
const time = new Date(2026, 10, 4, 9, 5, 7);
const entryFor = (f: Fixture, id: string | number = f.formula): LogEntry => ({
  id,
  time,
  input: f.formula,
  result: { ok: true, doc: f.expected },
});
const byName = (n: string) => fixtures.find((f) => f.name === n)!;

function setup() {
  const host = document.createElement("main");
  const input = document.createElement("input");
  document.body.append(host, input);
  const reroll = vi.fn();
  const writeText = vi.fn().mockResolvedValue(undefined);
  const log = mountLog(host, { focusInput: () => input.focus(), reroll, writeText });
  log.bindInput(input);
  const entries = ["d20-seed1.json", "4d6dl1-seed3.json", "compound-reroll-seed3.json"].map((n, i) =>
    entryFor(byName(n), i),
  );
  entries.forEach((e) => log.append(e));
  return { host, input, log, reroll, writeText, entries };
}

function press(el: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(e);
  return e;
}
const selected = (host: HTMLElement) =>
  [...host.querySelectorAll(".log-entry")].findIndex((n) => n.classList.contains("selected"));

describe("keyboard mode", () => {
  it("Esc from the box focuses the log on the newest entry; J/K move", () => {
    const { host, input } = setup();
    input.focus();
    expect(press(input, "Escape").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host);
    expect(selected(host)).toBe(2);
    press(host, "k");
    expect(selected(host)).toBe(1);
    press(host, "K");
    press(host, "k");
    expect(selected(host)).toBe(0); // clamps
    press(host, "j");
    press(host, "J");
    press(host, "j");
    expect(selected(host)).toBe(2);
    expect(host.getAttribute("aria-activedescendant")).toBe(host.querySelectorAll(".log-entry")[2].id);
    expect(host.querySelector('[role="status"]')!.textContent).toContain("Entry 3 of 3");
  });

  it("J/K/R/C are swallowed while the log has focus", () => {
    const { host, input, log } = setup();
    log.focusLog();
    for (const k of ["j", "k", "r", "c"]) expect(press(host, k).defaultPrevented).toBe(true);
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(host);
  });

  it("any other printable key, or Esc, returns focus to the box without swallowing the key", () => {
    const { host, input, log } = setup();
    log.focusLog();
    expect(press(host, "d").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    log.focusLog();
    press(host, "Escape");
    expect(document.activeElement).toBe(input);
    log.focusLog();
    press(host, "2");
    expect(document.activeElement).toBe(input);
  });

  it("leaves modified keys to the browser", () => {
    const { host, log } = setup();
    log.focusLog();
    expect(press(host, "c", { metaKey: true }).defaultPrevented).toBe(false);
  });

  it("leaves Ctrl-modified keys to the browser too", () => {
    const { host, log } = setup();
    log.focusLog();
    expect(press(host, "c", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press(host, "k", { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it("Enter toggles the die tree", () => {
    const { host, log } = setup();
    log.focusLog();
    press(host, "Enter");
    const node = host.querySelectorAll(".log-entry")[2];
    expect(node.querySelector(".die-tree")).not.toBeNull();
    expect(node.getAttribute("aria-expanded")).toBe("true");
    press(host, "Enter");
    expect(node.querySelector(".die-tree")).toBeNull();
    expect(node.getAttribute("aria-expanded")).toBe("false");
  });

  it("R rerolls the selected entry's input; C copies only the formula", () => {
    const { host, log, reroll, writeText, entries } = setup();
    log.focusLog();
    press(host, "k");
    press(host, "r");
    expect(reroll).toHaveBeenCalledWith(entries[1]);
    press(host, "c");
    expect(writeText.mock.calls[0][0]).toBe(entries[1].input);
  });

  it("selected entries offer reroll, copy and copy json buttons; copy json is the --json document", async () => {
    const { host, writeText, entries } = setup();
    const node = host.querySelectorAll(".log-entry")[0] as HTMLElement;
    node.click();
    expect(node.classList.contains("selected")).toBe(true);
    const labels = [...node.querySelectorAll(".entry-action")].map((b) => b.textContent);
    expect(labels).toEqual(["reroll", "copy", "copy json"]);
    (node.querySelectorAll(".entry-action")[2] as HTMLElement).click();
    await Promise.resolve();
    const r = entries[0].result;
    if (!r.ok || !("doc" in r)) throw new Error();
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(r.doc);
  });

  it("errors can be copied and rerolled but have no tree or json", () => {
    const host = document.createElement("main");
    const writeText = vi.fn();
    const log = mountLog(host, { reroll: () => {}, writeText });
    log.append({ id: 1, time, input: "2d6 +", result: { ok: false, message: "unexpected end" } });
    log.focusLog();
    press(host, "Enter");
    expect(host.querySelector(".die-tree")).toBeNull();
    expect(host.querySelectorAll(".entry-action")).toHaveLength(2);
    press(host, "c");
    expect(writeText).toHaveBeenCalledWith("2d6 +");
  });
});

describe("die tree", () => {
  it("explains every die of every golden fixture, with no unknown step", () => {
    let dice = 0;
    for (const f of fixtures) {
      for (const roll of f.expected.rolls) {
        const tree = dieTree(roll);
        for (const s of tree.sections) {
          for (const r of s.rows) {
            dice++;
            expect(r.step, `${f.name} ${s.term} #${r.die}`).not.toMatch(/unknown/i);
            expect(r.step).not.toBe("");
          }
        }
      }
    }
    expect(dice).toBeGreaterThan(100);
  });

  it("uses the library's reasons", () => {
    const steps = (name: string) =>
      dieTree(byName(name).expected.rolls[0]).sections.flatMap((s) => s.rows.map((r) => r.step));
    expect(steps("4d6dl1-seed3.json")).toContain("dropped, lowest of pool (dl1)");
    expect(steps("explode-plain-seed2.json").join("|")).toMatch(/extra die from \d+ \(!\)/);
    expect(steps("compound-reroll-seed3.json").join("|")).toMatch(/rerolled once \(r1\)/);
  });

  it("footer gives the order of operations and the total", () => {
    const t = dieTree(byName("4d6dl1-seed3.json").expected.rolls[0]);
    expect(t.order).toBe("keep/drop (dl1)");
    expect(t.total).toBe("11");
  });
});
