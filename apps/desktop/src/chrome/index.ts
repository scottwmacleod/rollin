import "./chrome.css";
import type { About, Edit, Execution, Roll } from "../api/generated";
import { hasMod, modAria, modHint } from "../platform";
import { presetRows } from "../sidebar/model";
import type { SessionStore } from "../store";
import { el, openNewCharacter, openPresetDialog } from "./dialog";
import { eventFor, failureText, messageOf, rollsIn, type AppEvent, type PaletteAction, type PaletteRow } from "./model";
import { mountPalette } from "./palette";
import { mountSwitcher } from "./switcher";
import { mountSystemChip, systemLabel, systemName } from "./system";

export interface ChromeDeps {
  /** Runs a typed edit of saved data (`api.edit`). */
  edit(change: Edit): Promise<Execution>;
  /** The Session's saved data; the top bar draws it and never keeps a copy. */
  store: SessionStore;
  /** Sets or clears a game system; rejects with the library's message. */
  setSystem(scope: "character" | "default", character: string | null, system: string | null): Promise<void>;
  check(formula: string): Promise<void>;
  sample(formula: string): Promise<Roll[]>;
  about(): Promise<About>;
  /** Rolls or runs a line into the log exactly as if it had been typed. */
  run(line: string): void;
  toggleSidebar(): void;
}

export interface Chrome {
  /** Call for every line that reached the log: counts rolls, shows the event.
   * It does not read the state; whoever recorded the line refreshes the store. */
  note(execution: Execution): void;
  openPalette(initial?: string): void;
  /** Blinks the logo cursor faster while something is loading, such as an update check. */
  setBusy(busy: boolean): void;
  /** Removes the window and document listeners (for tests). */
  dispose(): void;
}

/** Fills the toolbar and the status bar and owns the palette, the character
 * switcher and their dialogs. Every change is a typed edit that runs the
 * library's own command, so the library validates and words it, as in the CLI. */
export function mountChrome(toolbar: HTMLElement, status: HTMLElement, deps: ChromeDeps): Chrome {
  const { store } = deps;
  let event: AppEvent | null = null;
  let rolls = 0;
  let version = "";

  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Rollin");
  const word = el("span", "tb-word", "rollin");
  const cursor = el("span", "tb-cursor");
  cursor.setAttribute("aria-hidden", "true");
  word.append(cursor);
  const charBtn = el("button", "tb-btn tb-char-btn");
  charBtn.type = "button";
  const search = el("button", "tb-btn tb-search");
  search.type = "button";
  search.setAttribute("aria-label", "Search presets, characters and commands");
  search.setAttribute("aria-keyshortcuts", modAria("K"));
  search.append(el("span", "", "Search"), el("kbd", "", modHint("K")));
  const spacer = el("span", "tb-spacer");
  toolbar.replaceChildren(word, charBtn, search, spacer);

  const systemChip = el("button", "st-cell st-system");
  systemChip.type = "button";
  const system = mountSystemChip(systemChip, {
    set: async (scope, value) => {
      try {
        await deps.setSystem(scope, null, value);
      } catch (failure) {
        return messageOf(failure);
      }
      event = { glyph: "~", text: value === null ? `${scope === "default" ? "default " : ""}system cleared` : `${scope === "default" ? "default " : ""}system set to ${systemName(value)}` };
      await store.refresh();
      return null;
    },
  });

  function paintStatus() {
    const s = store.state;
    const parts: (Node | string)[] = [];
    const cell = (text: string) => el("span", "st-cell", text);
    if (s) {
      parts.push(
        cell(s.active_character),
        cell(`${s.vars.length} ${s.vars.length === 1 ? "var" : "vars"} · ${presetRows(s).length} ${presetRows(s).length === 1 ? "preset" : "presets"}`),
      );
    }
    if (s) parts.push(systemChip);
    parts.push(cell(`${rolls} ${rolls === 1 ? "roll" : "rolls"} this session`));
    const ev = el("span", "st-cell st-event");
    if (event) ev.append(el("span", "st-glyph", event.glyph), document.createTextNode(` ${event.text}`.trimEnd()));
    ev.setAttribute("aria-live", "polite");
    parts.push(ev);
    status.replaceChildren(...parts, el("span", "tb-spacer"), el("span", "st-cell", version ? `v${version}` : ""));
  }

  function paintAll() {
    const current = store.state;
    if (current) {
      switcher.update(current.characters, current.active_character);
      system.update(current);
    }
    paintStatus();
  }

  /** Runs an edit from the chrome; resolves to the library's error text. */
  async function exec(change: Edit): Promise<string | null> {
    let result: Execution;
    try {
      result = await deps.edit(change);
    } catch (failure) {
      return messageOf(failure);
    }
    const error = failureText(result);
    if (error !== null) return error;
    event = eventFor(result) ?? event;
    await store.refresh();
    return null;
  }

  const switcher = mountSwitcher(charBtn, {
    switchTo: (name) => exec({ kind: "switch_character", name }),
    rename: (from, to) => exec({ kind: "rename_character", from, to }),
    remove: (name) => exec({ kind: "delete_character", name }),
    newCharacter: () => newCharacter(),
  });

  function newCharacter() {
    openNewCharacter({
      characters: store.state?.characters ?? [],
      systems: store.state?.systems ?? [],
      defaultSystem: store.state?.default_system ?? null,
      create: (name, system) => exec({ kind: "new_character", name, system }),
    });
  }

  function presetDialog(original: { name: string; formula: string; global: boolean } | null) {
    const current = store.state;
    if (!current) return;
    openPresetDialog({
      state: current,
      original,
      check: deps.check,
      sample: deps.sample,
      describe: messageOf,
      apply: exec,
      remove: (name, global) => exec({ kind: "delete_preset", name, global }),
    });
  }

  function editPreset(name: string, global: boolean) {
    const entry = (global ? store.state?.global_presets : store.state?.presets)?.find((p) => p.name === name);
    if (entry) presetDialog({ name: entry.name, formula: entry.formula, global });
  }

  function perform(action: PaletteAction) {
    switch (action.type) {
      case "roll":
      case "run":
        return deps.run(action.line);
      case "switch":
        return void exec({ kind: "switch_character", name: action.name });
      case "scope":
        return palette.open(action.prefix);
      case "ui":
        switch (action.id) {
          case "new-character":
            return newCharacter();
          case "new-preset":
            return presetDialog(null);
          case "toggle-sidebar":
            return deps.toggleSidebar();
        }
    }
  }

  const palette = mountPalette({
    store,
    perform,
    edit: (row: PaletteRow) => {
      const p = row.preset;
      if (p) editPreset(p.name, p.source.kind === "global");
    },
  });

  search.addEventListener("click", () => palette.open());
  const onKey = (e: KeyboardEvent) => {
    if (hasMod(e) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (palette.isOpen()) palette.close();
      else palette.open();
    }
  };
  const onEdit = (e: Event) => {
    const d = (e as CustomEvent<{ name?: unknown; global?: unknown } | null>).detail;
    if (typeof d?.name === "string") editPreset(d.name, d.global === true);
  };
  document.addEventListener("keydown", onKey);
  window.addEventListener("rollin:edit-preset", onEdit);

  void deps.about().then(
    (a) => {
      version = a.app_version;
      paintStatus();
    },
    () => undefined,
  );
  store.subscribe(paintAll);
  paintAll();

  return {
    note(execution) {
      rolls += rollsIn(execution);
      event = eventFor(execution) ?? event;
    },
    openPalette: (initial) => palette.open(initial),
    setBusy: (busy) => word.classList.toggle("is-busy", busy),
    dispose() {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("rollin:edit-preset", onEdit);
    },
  };
}
