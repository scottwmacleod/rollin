import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Execution, PresetEntry, SessionState } from "../api/generated";
import { asPlatform } from "../platform.test";
import { edits, presetRows } from "./model";
import { createStore, type SessionStore } from "../store";
import { mountSidebar } from "./index";

const preset = (name: string, source: PresetEntry["source"], shadow: PresetEntry["shadow"] = { kind: "none" }): PresetEntry => ({
  name,
  formula: `d20+${name.length}`,
  source,
  shadow,
});
const ch = { kind: "character", name: "aria" } as const;
const gl = { kind: "global" } as const;

function stateWith(presets: PresetEntry[], globals: PresetEntry[], vars: [string, number][] = [["str", 3]]): SessionState {
  return { active_character: "aria", characters: ["aria"], vars, presets, global_presets: globals, system: null, default_system: null, effective_system: null, systems: ["dnd5e"], seed: null, history: [] };
}

describe("presetRows", () => {
  it("puts character presets before globals and numbers the first nine", () => {
    const p = Array.from({ length: 8 }, (_, i) => preset(`c${i}`, ch));
    const g = [preset("g0", gl), preset("g1", gl)];
    const rows = presetRows({ presets: p, global_presets: g });
    expect(rows.map((r) => r.entry.name)).toEqual([...p, ...g].map((e) => e.name));
    expect(rows.map((r) => r.shortcut)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, null]);
  });

  it("skips shadowed globals for shortcuts", () => {
    const rows = presetRows({
      presets: [preset("hit", ch, { kind: "shadows" })],
      global_presets: [preset("hit", gl, { kind: "shadowed_by", by: "aria" }), preset("save", gl)],
    });
    expect(rows.map((r) => [r.shadowed, r.shortcut])).toEqual([[false, 1], [true, null], [false, 2]]);
  });
});

describe("sidebar", () => {
  let run: ReturnType<typeof vi.fn>;
  let edit: ReturnType<typeof vi.fn>;
  let current: SessionState;
  let store: SessionStore;
  const ok: Execution = { status: "empty" };

  async function mount() {
    document.body.innerHTML = `<div id="app"><aside class="sidebar"></aside></div>`;
    store = createStore(async () => current);
    const sb = mountSidebar(document.querySelector(".sidebar")!, {
      edit: edit as never,
      store,
      run: run as never,
    });
    await store.refresh();
    expect(document.querySelector(".sb-header")).not.toBeNull();
    return sb;
  }

  beforeEach(() => {
    run = vi.fn();
    edit = vi.fn(async () => ok);
    current = stateWith([preset("attack", ch)], [preset("save", gl)]);
  });

  it("draws the three sections", async () => {
    await mount();
    expect([...document.querySelectorAll(".sb-header")].map((h) => h.textContent)).toEqual([
      "Variables · aria",
      "Presets",
      "Global",
    ]);
  });

  it("rolls a preset by its name on click, and every row is a button", async () => {
    await mount();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(".sb-preset")];
    expect(buttons.length).toBe(2);
    buttons[0].click();
    expect(run).toHaveBeenCalledWith("attack");
    expect(document.querySelectorAll(".sidebar-root li > :not(button):not(input)").length).toBe(0);
  });

  it("does not roll a shadowed global", async () => {
    current = stateWith([preset("save", ch, { kind: "shadows" })], [preset("save", gl, { kind: "shadowed_by", by: "aria" })]);
    await mount();
    document.querySelectorAll<HTMLButtonElement>(".sb-preset")[1].click();
    expect(run).not.toHaveBeenCalled();
  });

  it("⌘1-9 follows displayed order", async () => {
    asPlatform("MacIntel");
    await mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "2", metaKey: true }));
    expect(run).toHaveBeenCalledWith("save");
  });

  it("edits a variable with a typed edit and shows the library error", async () => {
    edit.mockResolvedValueOnce({
      status: "error",
      error: { kind: "not_an_integer", message: "'x' is not an integer", hints: [] },
      span: null,
      source: null,
    });
    await mount();
    document.querySelector<HTMLButtonElement>(".sb-var")!.click();
    const input = document.querySelector<HTMLInputElement>(".sb-input")!;
    input.value = "x";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await vi.waitFor(() => expect(document.querySelector(".sb-error")!.textContent).toBe("'x' is not an integer"));
    expect(edit).toHaveBeenCalledWith({ kind: "set_variable", name: "str", value: "x" });
  });

  it("⌘B toggles the sidebar", async () => {
    asPlatform("MacIntel");
    await mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true }));
    expect(document.getElementById("app")!.classList.contains("sidebar-collapsed")).toBe(true);
  });

  it("Ctrl 1-9 and Ctrl B work on Windows, ⌘ does not", async () => {
    asPlatform("Win32");
    await mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "2", metaKey: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true }));
    expect(run).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "2", ctrlKey: true }));
    expect(run).toHaveBeenCalledWith("save");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));
    expect(document.getElementById("app")!.classList.contains("sidebar-collapsed")).toBe(true);
  });
});

describe("edits", () => {
  it("builds typed edits, not command lines", () => {
    expect(edits.setVar("@str", " 4 ")).toEqual({ kind: "set_variable", name: "str", value: " 4 " });
    expect(edits.deletePreset("hit", false)).toEqual({ kind: "delete_preset", name: "hit", global: false });
    expect(edits.makeGlobal("hit", "d20+5")).toEqual({
      kind: "move_preset",
      from: { name: "hit", global: false },
      name: "hit",
      formula: "d20+5",
      global: true,
    });
  });
});
