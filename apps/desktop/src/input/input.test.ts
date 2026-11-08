import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommandInfo, Execution } from "../api";
import { mountInput, type InputApi } from "./index";
import { commonPrefix, History, isFormulaLine, pieces, usageFor } from "./words";

const vocabulary: CommandInfo[] = [
  { words: ["save"], usage: "save <name> <formula> [--global]", subcommands: [], session_only: false },
  { words: ["set"], usage: "set <name> <integer>", subcommands: [], session_only: false },
  { words: ["char"], usage: "char [<name> | new <name> | rename <old> <new> | delete <name>]", subcommands: ["new", "rename", "delete"], session_only: false },
  { words: ["presets"], usage: null, subcommands: [], session_only: false },
  { words: ["quit", "exit"], usage: null, subcommands: [], session_only: true },
];

const failure = (message: string) => ({ status: "error", error: { kind: "x", message, hints: [] }, span: null, source: null });
const ok: Execution = { status: "empty" };

let current: { dispose(): void } | undefined;
function setup(over: Partial<InputApi> = {}, history: string[] = []) {
  current?.dispose();
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.append(host);
  const api: InputApi = {
    check: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue({ start: 0, candidates: [] }),
    execute: vi.fn().mockResolvedValue(ok),
    vocabulary: vi.fn().mockResolvedValue(vocabulary),
    ...over,
  };
  const onSubmit = vi.fn();
  const box = mountInput(host, { api, onSubmit, history, debounceMs: 10 });
  current = box;
  const input = host.querySelector("input")!;
  const type = (v: string) => {
    input.value = v;
    input.setSelectionRange(v.length, v.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const key = (k: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
    input.dispatchEvent(e);
    return e;
  };
  const error = () => host.querySelector<HTMLElement>(".fx-error")!;
  return { host, api, onSubmit, box, input, type, key, error };
}
const flush = () => new Promise((r) => setTimeout(r, 30));

afterEach(() => vi.restoreAllMocks());

describe("words", () => {
  it("colours variables and labels, losslessly", () => {
    const line = "d20+@str # attack, d6";
    const ps = pieces(line);
    expect(ps.map((p) => p.text).join("")).toBe(line);
    expect(ps.filter((p) => p.kind === "variable").map((p) => p.text)).toEqual(["@str"]);
    expect(ps.filter((p) => p.kind === "label").map((p) => p.text)).toEqual(["# attack"]);
  });
  it("only formulas go to check", () => {
    expect(isFormulaLine("d20+5", vocabulary)).toBe(true);
    expect(isFormulaLine("adv-attack", vocabulary)).toBe(true);
    expect(isFormulaLine("save x d20", vocabulary)).toBe(false);
    expect(isFormulaLine("  ", vocabulary)).toBe(false);
    expect(isFormulaLine("-h", vocabulary)).toBe(false);
    expect(isFormulaLine("exit", vocabulary)).toBe(false);
    expect(isFormulaLine("SAVE x d20", vocabulary)).toBe(false);
    expect(isFormulaLine("Exit", vocabulary)).toBe(false);
    expect(isFormulaLine("save x d20", [])).toBe(true);
  });
  it("usage appears once a command word is typed", () => {
    expect(usageFor("sav", vocabulary)).toBeNull();
    expect(usageFor("save", vocabulary)).toContain("<name> <formula>");
    expect(usageFor("SAVE ", vocabulary)).toContain("<name> <formula>");
    expect(usageFor("  set prof", vocabulary)).toContain("<integer>");
    expect(usageFor("char ", vocabulary)).toContain("new <name>");
    expect(usageFor("d20+5", vocabulary)).toBeNull();
    expect(usageFor("toString", vocabulary)).toBeNull();
  });

  it("common prefix", () => {
    expect(commonPrefix(["attack", "attune"])).toBe("att");
    expect(commonPrefix([])).toBe("");
  });
  it("history walks back and restores the draft", () => {
    const h = new History(["a", "b"]);
    expect(h.prev("draft")).toBe("b");
    expect(h.prev("")).toBe("a");
    expect(h.prev("")).toBeNull();
    expect(h.next()).toBe("b");
    expect(h.next()).toBe("draft");
    expect(h.next()).toBeNull();
  });
});

describe("formula box", () => {
  it("has a label and an accessible name", () => {
    const { host, input } = setup();
    const label = host.querySelector("label")!;
    expect(label.htmlFor).toBe(input.id);
    expect(label.textContent).toBe("Formula");
  });

  it("shows the library's message verbatim, then clears it on a fix", async () => {
    const check = vi.fn().mockRejectedValueOnce(failure("adv needs exactly one die")).mockResolvedValue(undefined);
    const { type, error, host, input } = setup({ check });
    type("2d20adv");
    await flush();
    expect(error().hidden).toBe(false);
    expect(error().textContent).toBe("adv needs exactly one die");
    expect(host.querySelector(".fx-field")!.classList.contains("invalid")).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    type("d20adv");
    await flush();
    expect(error().hidden).toBe(true);
    expect(host.querySelector(".fx-field")!.classList.contains("invalid")).toBe(false);
  });

  it("ignores a stale check result", async () => {
    let first!: (v: unknown) => void;
    const check = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, rej) => (first = rej)))
      .mockResolvedValue(undefined);
    const { type, error } = setup({ check });
    type("d");
    await flush();
    type("d20");
    await flush();
    first(failure("old"));
    await flush();
    expect(error().hidden).toBe(true);
  });

  it("shows usage under the box for a typed command, and not for formulas", async () => {
    const { host, type } = setup();
    await flush(); // the library's vocabulary arrives
    const hint = () => host.querySelector<HTMLElement>(".fx-hint")!;
    expect(hint().hidden).toBe(true);
    type("save");
    expect(hint().hidden).toBe(false);
    expect(hint().textContent).toContain("save <name> <formula> [--global]");
    type("d20");
    expect(hint().hidden).toBe(true);
  });

  it("does not live-check commands", async () => {
    const { type, api } = setup();
    type("save x d20");
    await flush();
    expect(api.check).not.toHaveBeenCalled();
  });

  it("Enter rolls, clears the box and hands the result on", async () => {
    const { type, key, input, api, onSubmit } = setup();
    type("d20");
    key("Enter");
    await flush();
    expect(api.execute).toHaveBeenCalledWith("d20");
    expect(onSubmit).toHaveBeenCalledWith("d20", ok);
    expect(input.value).toBe("");
  });

  it("Enter on an error submits nothing and keeps the text", async () => {
    const check = vi.fn().mockRejectedValue(failure("bad"));
    const { type, key, input, api, onSubmit, error } = setup({ check });
    type("d");
    key("Enter");
    await flush();
    expect(api.execute).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("d");
    expect(error().textContent).toBe("bad");
  });

  it("keeps the text when execute itself reports an error", async () => {
    const execute = vi.fn().mockResolvedValue(failure("no such character"));
    const { type, key, input, onSubmit, error } = setup({ execute });
    type("char x");
    key("Enter");
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("char x");
    expect(error().textContent).toBe("no such character");
  });

  it("Tab inserts a single completion at the word", async () => {
    const complete = vi.fn().mockResolvedValue({ start: 4, candidates: ["attack"] });
    const { type, key, input, host } = setup({ complete });
    type("d20 att");
    key("Tab");
    await flush();
    expect(complete).toHaveBeenCalledWith("d20 att", 7);
    expect(input.value).toBe("d20 attack");
    expect(host.querySelector<HTMLElement>(".fx-list")!.hidden).toBe(true);
  });

  it("Tab with several candidates extends the prefix and lists them", async () => {
    const complete = vi.fn().mockResolvedValue({ start: 0, candidates: ["attack", "attune"] });
    const { type, key, input, host } = setup({ complete });
    type("a");
    key("Tab");
    await flush();
    expect(input.value).toBe("att");
    const rows = [...host.querySelectorAll(".fx-option")];
    expect(rows.map((r) => r.textContent)).toEqual(["attack", "attune"]);
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("walks the list with arrows and accepts with Enter", async () => {
    const complete = vi.fn().mockResolvedValue({ start: 0, candidates: ["attack", "attune"] });
    const { type, key, input, host, onSubmit } = setup({ complete });
    type("a");
    key("Tab");
    await flush();
    key("ArrowDown");
    key("ArrowDown");
    expect(host.querySelectorAll(".fx-option")[1].getAttribute("aria-selected")).toBe("true");
    key("Enter");
    await flush();
    expect(input.value).toBe("attune");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Enter with an open list but no active row still rolls", async () => {
    const complete = vi.fn().mockResolvedValue({ start: 0, candidates: ["attack", "attune"] });
    const { type, key, api } = setup({ complete });
    type("a");
    key("Tab");
    await flush();
    key("Enter");
    await flush();
    expect(api.execute).toHaveBeenCalled();
  });

  it("Esc closes the list before anything else hears it", async () => {
    const complete = vi.fn().mockResolvedValue({ start: 0, candidates: ["attack", "attune"] });
    const { type, key, host, input } = setup({ complete });
    const outer = vi.fn();
    input.addEventListener("keydown", outer);
    type("a");
    key("Tab");
    await flush();
    outer.mockClear();
    key("Escape");
    expect(host.querySelector<HTMLElement>(".fx-list")!.hidden).toBe(true);
    expect(outer).not.toHaveBeenCalled();
  });

  it("↑ and ↓ walk history in order and restore the draft", () => {
    const { type, key, input } = setup({}, ["d4", "d6", "d8"]);
    type("dra");
    key("ArrowUp");
    expect(input.value).toBe("d8");
    key("ArrowUp");
    expect(input.value).toBe("d6");
    key("ArrowDown");
    expect(input.value).toBe("d8");
    key("ArrowDown");
    expect(input.value).toBe("dra");
  });

  it("a submitted line joins the history", async () => {
    const { type, key, input } = setup();
    type("d20");
    key("Enter");
    await flush();
    key("ArrowUp");
    expect(input.value).toBe("d20");
  });

  it("a printable key anywhere else in the window lands in the box", () => {
    const { input } = setup();
    document.body.focus();
    const e = new KeyboardEvent("keydown", { key: "d", bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("d");
  });

  it("leaves keys alone while the log has focus", () => {
    const { input } = setup();
    const log = document.createElement("main");
    log.className = "roll-log-region";
    log.tabIndex = 0;
    document.body.append(log);
    log.focus();
    log.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true, cancelable: true }));
    expect(input.value).toBe("");
  });
});
