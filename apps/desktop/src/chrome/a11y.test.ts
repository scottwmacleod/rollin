import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../api/generated";
import { createStore } from "../store";
import { mountPalette, type Palette } from "./palette";
import { mountSwitcher, type Switcher } from "./switcher";

const flush = () => new Promise((r) => setTimeout(r, 0));

function state(): SessionState {
  return {
    active_character: "grog",
    characters: ["default", "grog", "mira"],
    vars: [],
    presets: [{ name: "attack", formula: "d20+5", source: { kind: "character", name: "grog" }, shadow: { kind: "none" } }],
    global_presets: [],
    system: null,
    default_system: null,
    effective_system: null,
    systems: ["dnd5e"],
    seed: null,
    history: [],
  };
}

const key = (target: Element, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

describe("palette accessibility", () => {
  let palette: Palette;
  const perform = vi.fn();

  async function open(initial?: string) {
    const store = createStore(async () => state());
    await store.refresh();
    palette = mountPalette({ store, perform, edit: vi.fn() });
    palette.open(initial);
    return document.querySelector<HTMLInputElement>(".pal-input")!;
  }
  afterEach(() => {
    palette?.close();
    document.body.innerHTML = "";
    perform.mockReset();
  });

  it("is a named modal dialog holding a combobox that controls a listbox", async () => {
    const input = await open();
    const box = document.querySelector(".pal")!;
    expect(box.getAttribute("role")).toBe("dialog");
    expect(box.getAttribute("aria-modal")).toBe("true");
    expect(box.getAttribute("aria-label")).toBe("Command palette");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(document.getElementById(input.getAttribute("aria-controls")!)?.getAttribute("role")).toBe("listbox");
    expect(document.activeElement).toBe(input);
  });

  it("puts only options and named groups inside the listbox", async () => {
    await open();
    const list = document.querySelector(".pal-list")!;
    for (const child of list.children) {
      const role = child.getAttribute("role");
      expect(["option", "group"]).toContain(role);
      if (role === "group") {
        const label = document.getElementById(child.getAttribute("aria-labelledby")!);
        expect(label?.textContent).toBeTruthy();
        expect(child.querySelectorAll("[role=option]").length).toBeGreaterThan(0);
      }
    }
  });

  it("points aria-activedescendant at the active option, and drops it when nothing matches", async () => {
    const input = await open();
    const active = document.getElementById(input.getAttribute("aria-activedescendant")!)!;
    expect(active.getAttribute("role")).toBe("option");
    expect(active.getAttribute("aria-selected")).toBe("true");
    input.value = "zzzzzz";
    input.dispatchEvent(new Event("input"));
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("announces the result count and scope in a polite status", async () => {
    const input = await open();
    const status = document.querySelector(".pal [role=status]")!;
    expect(status.getAttribute("aria-live")).toBe("polite");
    input.value = "att";
    input.dispatchEvent(new Event("input"));
    expect(status.textContent).toBe("1 result");
    input.value = "zzzzzz";
    input.dispatchEvent(new Event("input"));
    expect(status.textContent).toBe("Nothing matches");
    input.value = "";
    input.dispatchEvent(new Event("input"));
    input.value = "@";
    input.dispatchEvent(new Event("input"));
    expect(status.textContent).toMatch(/^Characters: \d+ results?$/);
  });

  it("keeps Tab inside the palette", async () => {
    const input = await open();
    expect(key(input, "Tab")).toBe(false);
    expect(key(input, "Tab", { shiftKey: true })).toBe(false);
  });

  it("does not run a row when Enter confirms an IME composition", async () => {
    const input = await open();
    input.value = "att";
    input.dispatchEvent(new Event("input"));
    key(input, "Enter", { isComposing: true });
    expect(perform).not.toHaveBeenCalled();
    key(input, "Enter");
    expect(perform).toHaveBeenCalled();
  });

  it("moves the active row with PageDown and PageUp, stopping at the ends", async () => {
    const input = await open("@");
    const rows = document.querySelectorAll("[role=option]").length;
    key(input, "PageDown");
    expect(document.querySelector("[role=option][aria-selected=true]")!.id).toBe(`pal-row-${Math.min(rows - 1, 8)}`);
    key(input, "PageUp");
    expect(document.querySelector("[role=option][aria-selected=true]")!.id).toBe("pal-row-0");
  });

  it("puts focus back where it was on Escape", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const input = await open();
    key(input, "Escape");
    expect(document.querySelector(".pal")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("switcher accessibility", () => {
  let button: HTMLButtonElement;
  let sw: Switcher;
  const deps = {
    switchTo: vi.fn(async () => null as string | null),
    rename: vi.fn(async () => null as string | null),
    remove: vi.fn(async () => null as string | null),
    newCharacter: vi.fn(),
  };

  function mount() {
    document.body.innerHTML = `<button class="tb-char-btn"></button>`;
    button = document.querySelector("button")!;
    sw = mountSwitcher(button, deps);
    sw.update(["default", "grog", "mira"], "grog");
  }
  afterEach(() => {
    sw?.close();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("opens from ArrowDown on the button, with focus on the current character", () => {
    mount();
    expect(key(button, "ArrowDown")).toBe(false);
    const menu = document.querySelector("[role=menu]")!;
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(menu.id);
    expect(document.activeElement?.textContent).toContain("grog");
  });

  it("keeps the menu's structure valid: only menu items, a separator and the alert", () => {
    mount();
    button.click();
    const menu = document.querySelector("[role=menu]")!;
    const roles = [...menu.querySelectorAll("[role]")].map((n) => n.getAttribute("role"));
    expect(roles.filter((r) => r === "menuitemradio")).toHaveLength(3);
    expect(roles).toContain("separator");
    expect(menu.querySelector(".sw-list")!.getAttribute("role")).toBe("none");
  });

  it("jumps to the first and last row with Home and End", () => {
    mount();
    button.click();
    const menu = document.querySelector("[role=menu]")!;
    key(document.activeElement!, "Home");
    expect(document.activeElement?.textContent).toContain("default");
    key(document.activeElement!, "End");
    expect(document.activeElement?.textContent).toContain("New character");
    expect(menu).toBeTruthy();
  });

  it("closes on Tab and returns focus to the button", () => {
    mount();
    button.click();
    expect(key(document.activeElement!, "Tab")).toBe(false);
    expect(document.querySelector("[role=menu]")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("returns focus to the button after choosing a character", async () => {
    mount();
    button.click();
    document.querySelector<HTMLElement>('.sw-pick[data-name="mira"]')!.click();
    await flush();
    expect(document.querySelector("[role=menu]")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("keeps focus in the menu when a delete fails", async () => {
    deps.remove.mockResolvedValueOnce("cannot delete");
    mount();
    button.click();
    key(document.querySelector('.sw-pick[data-name="mira"]')!, "Delete");
    document.querySelector<HTMLElement>(".sw-confirm.is-danger")!.click();
    await flush();
    expect(document.querySelector("[role=alert]")!.textContent).toBe("cannot delete");
    expect(document.activeElement?.closest(".sw-menu")).not.toBeNull();
  });

  it("tells assistive tech which keys rename and delete a row", () => {
    mount();
    button.click();
    expect(document.querySelector('.sw-pick[data-name="mira"]')!.getAttribute("aria-keyshortcuts")).toBe("F2 Delete");
    expect(document.querySelector('.sw-pick[data-name="default"]')!.getAttribute("aria-keyshortcuts")).toBe("Delete");
  });
});
