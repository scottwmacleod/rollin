import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Execution, SessionState } from "../api/types";
import { asPlatform } from "../platform.test";
import { mountChrome, type Chrome, type ChromeDeps } from "./index";

const flush = () => new Promise((r) => setTimeout(r, 0));

function base(): SessionState {
  return {
    active_character: "grog",
    characters: ["default", "grog", "mira"],
    vars: [["str", 4]],
    presets: [{ name: "attack", formula: "d20+5", source: { kind: "character", name: "grog" }, shadow: { kind: "none" } }],
    global_presets: [],
    system: null,
    default_system: null,
    systems: ["dnd5e"],
    seed: null,
    history: [],
  };
}

describe("chrome", () => {
  let st: SessionState;
  let deps: ChromeDeps;
  let execute: ReturnType<typeof vi.fn>;
  let toolbar: HTMLElement;
  let status: HTMLElement;
  let mounted: Chrome | null = null;

  async function mount() {
    document.body.innerHTML = `<header class="toolbar"></header><footer class="status-bar"></footer>`;
    toolbar = document.querySelector(".toolbar")!;
    status = document.querySelector(".status-bar")!;
    const chrome = mountChrome(toolbar, status, deps);
    mounted = chrome;
    await flush();
    return chrome;
  }

  beforeEach(() => {
    st = base();
    execute = vi.fn(async (): Promise<Execution> => ({ status: "empty" }));
    deps = {
      execute: execute as never,
      state: async () => structuredClone(st),
      setSystem: async (scope, character, system) => {
        if (scope === "default") st.default_system = system;
        else if (character === null || character === st.active_character) st.system = system;
      },
      check: async () => undefined,
      sample: async () => [],
      about: async () => ({ name: "Rollin", app_version: "0.1.2", library_version: "1", license: "MIT", repository: "" }),
      run: vi.fn(),
      toggleSidebar: vi.fn(),
      changed: vi.fn(),
    };
  });
  afterEach(() => {
    mounted?.dispose();
    document.body.innerHTML = "";
  });

  it("draws the logo cursor after the word and marks it busy on request", async () => {
    const chrome = await mount();
    const word = toolbar.querySelector(".tb-word")!;
    expect(word.textContent).toBe("rollin");
    expect(word.querySelector(".tb-cursor")?.getAttribute("aria-hidden")).toBe("true");
    chrome.setBusy(true);
    expect(word.classList.contains("is-busy")).toBe(true);
    chrome.setBusy(false);
    expect(word.classList.contains("is-busy")).toBe(false);
  });

  it("gives every toolbar control an accessible name", async () => {
    await mount();
    for (const b of toolbar.querySelectorAll("button")) {
      expect((b.getAttribute("aria-label") ?? b.textContent ?? "").trim(), b.outerHTML).not.toBe("");
    }
  });

  it("shows the status bar's counts, character and version", async () => {
    await mount();
    expect(status.textContent).toContain("grog");
    expect(status.textContent).toContain("1 var · 1 preset");
    expect(status.textContent).toContain("0 rolls this session");
    expect(status.textContent).toContain("v0.1.2");
  });

  it("counts rolls and shows the library's text for the last event", async () => {
    const chrome = await mount();
    await chrome.record({ status: "ok", output: { kind: "rolls", preset: null, rolls: [{}, {}], lines: [], hints: [] } } as never);
    await chrome.record({
      status: "ok",
      output: { kind: "saved", name: "braceup", formula: "2d6", character: "grog", replaced: null, lines: ["saved 'braceup' on 'grog': 2d6"], hints: [] },
    } as never);
    expect(status.textContent).toContain("2 rolls this session");
    expect(status.querySelector(".st-event")?.textContent).toBe("+ saved 'braceup' on 'grog': 2d6");
  });

  it("shows the system in force, and sets the character's and the default from the chip", async () => {
    await mount();
    const chip = status.querySelector<HTMLButtonElement>(".st-system")!;
    expect(chip.textContent).toBe("no system");
    chip.click();
    const [own, fallback] = [...document.querySelectorAll<HTMLSelectElement>(".sys-select")];
    fallback.value = "dnd5e";
    fallback.dispatchEvent(new Event("change"));
    await flush();
    expect(st.default_system).toBe("dnd5e");
    expect(status.querySelector(".st-system")!.textContent).toBe("dnd5e");
    expect(document.querySelectorAll<HTMLSelectElement>(".sys-select")[0].options[0].textContent).toBe("Use default (dnd5e)");
    own.value = "dnd5e";
    own.dispatchEvent(new Event("change"));
    await flush();
    expect(st.system).toBe("dnd5e");
    document.querySelectorAll<HTMLSelectElement>(".sys-select")[1].value = "";
    document.querySelectorAll<HTMLSelectElement>(".sys-select")[1].dispatchEvent(new Event("change"));
    await flush();
    expect(st.default_system).toBeNull();
    expect(status.querySelector(".st-system")!.textContent).toBe("dnd5e");
  });

  it("has no seed, clear-log or sidebar controls in the toolbar", async () => {
    await mount();
    expect(toolbar.querySelector(".tb-seed")).toBeNull();
    expect(toolbar.querySelector('[aria-label="Clear log"]')).toBeNull();
    expect(toolbar.querySelector('[aria-label="Toggle sidebar"]')).toBeNull();
  });

  describe("character switcher", () => {
    it("switches with char <name> and rename/delete go through the CLI commands", async () => {
      await mount();
      const open = () => toolbar.querySelector<HTMLButtonElement>(".tb-char-btn")!.click();
      open();
      document.querySelector<HTMLButtonElement>('.sw-pick[data-name="mira"]')!.click();
      await flush();
      expect(execute).toHaveBeenCalledWith("char mira");
      expect(document.querySelector(".sw-menu")).toBeNull();

      open();
      document.querySelector<HTMLButtonElement>('[aria-label="Rename mira"]')!.click();
      const input = document.querySelector<HTMLInputElement>(".sw-input")!;
      input.value = "mirabel";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await flush();
      expect(execute).toHaveBeenCalledWith("char rename mira mirabel");

      open();
      document.querySelector<HTMLButtonElement>('[aria-label="Delete mira"]')!.click();
      document.querySelector<HTMLButtonElement>(".sw-confirm.is-danger")!.click();
      await flush();
      expect(execute).toHaveBeenCalledWith("char delete mira");
    });

    it("cannot rename default and caps the list at eight rows", async () => {
      st.characters = ["default", ...Array.from({ length: 11 }, (_, i) => `c${i}`)];
      await mount();
      toolbar.querySelector<HTMLButtonElement>(".tb-char-btn")!.click();
      expect(document.querySelector('[aria-label="Rename default"]')).toBeNull();
      expect(document.querySelector<HTMLElement>(".sw-list")!.style.maxHeight).toBe("224px");
    });

    it("shows the library's error and keeps the menu open", async () => {
      execute.mockResolvedValueOnce({ status: "rejected", message: "character 'x' does not exist" });
      await mount();
      toolbar.querySelector<HTMLButtonElement>(".tb-char-btn")!.click();
      document.querySelector<HTMLButtonElement>('.sw-pick[data-name="mira"]')!.click();
      await flush();
      expect(document.querySelector(".sw-error")?.textContent).toBe("character 'x' does not exist");
    });
  });

  describe("palette", () => {
    beforeEach(() => {
      asPlatform("MacIntel");
    });
    const press = (key: string, init: KeyboardEventInit = {}) =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));

    it("opens on ⌘K and closes on Esc", async () => {
      await mount();
      press("k", { metaKey: true });
      await flush();
      expect(document.querySelector(".pal")).not.toBeNull();
      document.querySelector(".pal")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(document.querySelector(".pal")).toBeNull();
    });

    it("uses Ctrl and a Ctrl K hint on Windows", async () => {
      asPlatform("Win32");
      await mount();
      expect(toolbar.querySelector(".tb-search kbd")!.textContent).toBe("Ctrl K");
      press("k", { metaKey: true });
      await flush();
      expect(document.querySelector(".pal")).toBeNull();
      press("k", { ctrlKey: true });
      await flush();
      expect(document.querySelector(".pal")).not.toBeNull();
    });

    it("rolls a preset on Enter", async () => {
      await mount();
      press("k", { metaKey: true });
      await flush();
      const input = document.querySelector<HTMLInputElement>(".pal-input")!;
      input.value = "att";
      input.dispatchEvent(new Event("input"));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(deps.run).toHaveBeenCalledWith("attack");
    });

    it("@ turns into a scope chip and Enter switches character", async () => {
      await mount();
      press("k", { metaKey: true });
      await flush();
      const input = document.querySelector<HTMLInputElement>(".pal-input")!;
      input.value = "@";
      input.dispatchEvent(new Event("input"));
      expect(document.querySelector<HTMLElement>(".pal-chip")!.hidden).toBe(false);
      input.value = "mi";
      input.dispatchEvent(new Event("input"));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await flush();
      expect(execute).toHaveBeenCalledWith("char mira");
    });

    it("teaches the scopes when empty, and a tip row fills the prefix in", async () => {
      await mount();
      press("k", { metaKey: true });
      await flush();
      expect(document.querySelector(".pal-group")?.textContent).toBe("Try typing");
      document.querySelector<HTMLElement>(".pal-row")!.click();
      expect(document.querySelector<HTMLElement>(".pal-chip")!.textContent).toBe("@ characters");
    });
  });

  describe("dialogs", () => {
    it("creates a character with char new, and disables Create for a name that exists", async () => {
      await mount();
      toolbar.querySelector<HTMLButtonElement>(".tb-char-btn")!.click();
      document.querySelector<HTMLButtonElement>(".sw-new")!.click();
      const input = document.querySelector<HTMLInputElement>(".dlg-input")!;
      const create = [...document.querySelectorAll<HTMLButtonElement>(".dlg-btn")].find((b) => b.textContent === "Create")!;
      expect(create.disabled).toBe(true);
      input.value = "Grog";
      input.dispatchEvent(new Event("input"));
      expect(create.disabled).toBe(true);
      expect(document.querySelector(".dlg-note")?.textContent).toBe("A character named grog already exists.");
      input.value = "tess";
      input.dispatchEvent(new Event("input"));
      expect(create.disabled).toBe(false);
      create.click();
      await flush();
      expect(execute).toHaveBeenCalledWith("char new tess");
      expect(document.querySelector(".dlg")).toBeNull();
    });

    it("edits a preset: renames by saving the new name and deleting the old", async () => {
      await mount();
      window.dispatchEvent(new CustomEvent("rollin:edit-preset", { detail: { name: "attack", global: false } }));
      const [name, formula] = document.querySelectorAll<HTMLInputElement>(".dlg-input");
      expect(name!.value).toBe("attack");
      expect(formula!.value).toBe("d20+5");
      name!.value = "strike";
      name!.dispatchEvent(new Event("input"));
      await flush();
      [...document.querySelectorAll<HTMLButtonElement>(".dlg-btn")].find((b) => b.textContent === "Save")!.click();
      await flush();
      expect(execute.mock.calls.map((c) => c[0])).toEqual(["save strike d20+5", "delete attack"]);
    });

    it("previews a sample roll, re-rolls it, and hides it when the formula is invalid", async () => {
      const roll = (total: number) => ({
        formula: "d20+5",
        total,
        expr: {
          type: "chain" as const,
          first: { type: "dice" as const, term: "d20", sides: 20, dice: [{ value: total - 5, status: "kept" as const }], subtotal: total - 5 },
          rest: [{ op: "+", node: { type: "number" as const, value: 5 } }],
          total,
        },
      });
      const sample = vi.fn<(f: string) => Promise<ReturnType<typeof roll>[]>>();
      sample.mockResolvedValueOnce([roll(12)]).mockResolvedValueOnce([roll(21)]);
      deps.sample = sample as unknown as ChromeDeps["sample"];
      deps.check = async (f) => (f.endsWith("+") ? Promise.reject({ error: { message: "missing a number after +" } }) : undefined);
      await mount();
      window.dispatchEvent(new CustomEvent("rollin:edit-preset", { detail: { name: "attack", global: false } }));
      await flush();
      const box = document.querySelector<HTMLElement>(".dlg-sample")!;
      expect(box.hidden).toBe(false);
      expect(box.querySelector(".dlg-sample-total")?.textContent).toBe("12");
      expect(execute).not.toHaveBeenCalled();
      box.querySelector<HTMLButtonElement>(".dlg-sample-btn")!.click();
      await flush();
      expect(box.querySelector(".dlg-sample-total")?.textContent).toBe("21");

      const formula = document.querySelectorAll<HTMLInputElement>(".dlg-input")[1]!;
      formula.value = "d20+";
      formula.dispatchEvent(new Event("input"));
      await flush();
      expect(box.hidden).toBe(true);
      expect(sample).toHaveBeenCalledTimes(2);
    });

    it("shows the library's message when a valid formula fails as it rolls", async () => {
      deps.sample = async () => Promise.reject({ error: { message: "divide by zero" } });
      await mount();
      window.dispatchEvent(new CustomEvent("rollin:edit-preset", { detail: { name: "attack", global: false } }));
      await flush();
      expect(document.querySelector<HTMLElement>(".dlg-sample")!.hidden).toBe(true);
      expect(document.querySelectorAll(".dlg-note")[1]?.textContent).toBe("divide by zero");
    });

    it("shows the library's message for a formula that would not roll", async () => {
      deps.check = async () => Promise.reject({ error: { message: "missing a number after +" } });
      await mount();
      window.dispatchEvent(new CustomEvent("rollin:edit-preset", { detail: { name: "attack", global: false } }));
      const formula = document.querySelectorAll<HTMLInputElement>(".dlg-input")[1]!;
      formula.value = "2d6+";
      formula.dispatchEvent(new Event("input"));
      await flush();
      expect(document.querySelectorAll(".dlg-note")[1]?.textContent).toBe("missing a number after +");
      expect([...document.querySelectorAll<HTMLButtonElement>(".dlg-btn")].find((b) => b.textContent === "Save")!.disabled).toBe(true);
    });
  });
});
