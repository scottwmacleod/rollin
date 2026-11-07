import "./chrome.css";
import type { About, Execution, Roll, SessionState } from "../api/types";
import { hasMod, modAria, modHint } from "../platform";
import { presetRows } from "../sidebar/model";
import { el, openNewCharacter, openPresetDialog } from "./dialog";
import { eventFor, failureText, messageOf, rollsIn, type AppEvent, type PaletteAction, type PaletteRow } from "./model";
import { mountPalette } from "./palette";
import { mountSwitcher } from "./switcher";
import { mountSystemChip, systemLabel } from "./system";

export interface ChromeDeps {
  execute(line: string): Promise<Execution>;
  state(): Promise<SessionState>;
  setSeed(seed: number | null): Promise<number | null>;
  /** Sets or clears a game system; rejects with the library's message. */
  setSystem(scope: "character" | "default", character: string | null, system: string | null): Promise<void>;
  check(formula: string): Promise<void>;
  sample(formula: string): Promise<Roll[]>;
  about(): Promise<About>;
  /** Rolls or runs a line into the log exactly as if it had been typed. */
  run(line: string): void;
  toggleSidebar(): void;
  clearLog(): void;
  /** A command run from the chrome changed saved data. */
  changed(): void;
}

export interface Chrome {
  /** Call for every line that reached the log: counts rolls, shows the event. */
  record(execution: Execution): Promise<void>;
  refresh(): Promise<void>;
  openPalette(initial?: string): void;
  /** Removes the window and document listeners (for tests). */
  dispose(): void;
}

/** "random" and an empty box mean entropy; anything else must be a whole
 * number the library's `--seed` accepts. */
export function parseSeed(text: string): number | null | undefined {
  const t = text.trim().toLowerCase();
  if (t === "" || t === "random") return null;
  return /^\d+$/.test(t) && Number.isSafeInteger(Number(t)) ? Number(t) : undefined;
}

function iconButton(label: string, glyph: string): HTMLButtonElement {
  const b = el("button", "tb-btn tb-icon", glyph);
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.title = label;
  return b;
}

/** Fills the toolbar and the status bar and owns the palette, the character
 * switcher and their dialogs. Every change goes through `execute`, so the
 * library validates and words it, as in the CLI. */
export function mountChrome(toolbar: HTMLElement, status: HTMLElement, deps: ChromeDeps): Chrome {
  let current: SessionState | null = null;
  let event: AppEvent | null = null;
  let rolls = 0;
  let version = "";

  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Rollin");
  const sidebarBtn = iconButton("Toggle sidebar", "◧");
  sidebarBtn.setAttribute("aria-keyshortcuts", modAria("B"));
  const word = el("span", "tb-word", "rollin");
  const charBtn = el("button", "tb-btn tb-char-btn");
  charBtn.type = "button";
  const search = el("button", "tb-btn tb-search");
  search.type = "button";
  search.setAttribute("aria-label", "Search presets, characters and commands");
  search.setAttribute("aria-keyshortcuts", modAria("K"));
  search.append(el("span", "", "Search"), el("kbd", "", modHint("K")));
  const seedBtn = el("button", "tb-btn tb-seed");
  seedBtn.type = "button";
  const clearBtn = iconButton("Clear log", "⌫");
  const spacer = el("span", "tb-spacer");
  toolbar.replaceChildren(sidebarBtn, word, charBtn, search, spacer, seedBtn, clearBtn);

  const systemChip = el("button", "st-cell st-system");
  systemChip.type = "button";
  const system = mountSystemChip(systemChip, {
    set: async (scope, value) => {
      try {
        await deps.setSystem(scope, null, value);
      } catch (failure) {
        return messageOf(failure);
      }
      event = { glyph: "~", text: value === null ? `${scope === "default" ? "default " : ""}system cleared` : `${scope === "default" ? "default " : ""}system set to ${value}` };
      await refresh();
      deps.changed();
      return null;
    },
  });

  function paintSeed() {
    const seed = current?.seed ?? null;
    seedBtn.textContent = `seed ${seed ?? "random"}`;
    seedBtn.setAttribute("aria-label", `Seed: ${seed ?? "random"}. Change seed`);
  }

  function paintStatus() {
    const s = current;
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

  async function refresh() {
    try {
      current = await deps.state();
    } catch {
      current = null;
    }
    if (current) {
      switcher.update(current.characters, current.active_character);
      system.update(current);
    }
    paintSeed();
    paintStatus();
  }

  /** Runs a command line from the chrome; resolves to the library's error text. */
  async function exec(line: string): Promise<string | null> {
    let result: Execution;
    try {
      result = await deps.execute(line);
    } catch (failure) {
      return messageOf(failure);
    }
    const error = failureText(result);
    if (error !== null) return error;
    event = eventFor(result) ?? event;
    await refresh();
    deps.changed();
    return null;
  }

  const switcher = mountSwitcher(charBtn, {
    switchTo: (name) => exec(`char ${name}`),
    rename: (from, to) => exec(`char rename ${from} ${to}`),
    remove: (name) => exec(`char delete ${name}`),
    newCharacter: () => newCharacter(),
  });

  function newCharacter() {
    openNewCharacter({
      characters: current?.characters ?? [],
      systems: current?.systems ?? [],
      defaultSystem: current?.default_system ?? null,
      create: async (name, chosen) => {
        const error = await exec(`char new ${name}`);
        if (error !== null || chosen === null) return error;
        try {
          await deps.setSystem("character", name, chosen);
        } catch (failure) {
          return messageOf(failure);
        }
        await refresh();
        return null;
      },
    });
  }

  function presetDialog(original: { name: string; formula: string; global: boolean } | null) {
    if (!current) return;
    openPresetDialog({
      state: current,
      original,
      check: deps.check,
      sample: deps.sample,
      describe: messageOf,
      apply: async (lines) => {
        for (const line of lines) {
          const error = await exec(line);
          if (error !== null) return error;
        }
        return null;
      },
      remove: (name, global) => exec(`delete ${name}${global ? " --global" : ""}`),
    });
  }

  function editPreset(name: string, global: boolean) {
    const entry = (global ? current?.global_presets : current?.presets)?.find((p) => p.name === name);
    if (entry) presetDialog({ name: entry.name, formula: entry.formula, global });
  }

  function setSeed(seed: number | null) {
    return deps.setSeed(seed).then(async (applied) => {
      event = { glyph: "~", text: applied === null ? "seed set to random" : `seed set to ${applied}` };
      await refresh();
    });
  }

  function editSeed() {
    const input = el("input", "tb-seed-input");
    input.setAttribute("aria-label", "Seed: a whole number, or random");
    input.placeholder = "number or random";
    input.value = current?.seed === null || current?.seed === undefined ? "" : String(current.seed);
    input.spellcheck = false;
    let done = false;
    const finish = () => {
      done = true;
      input.replaceWith(seedBtn);
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const seed = parseSeed(input.value);
        if (seed === undefined) {
          input.setAttribute("aria-invalid", "true");
          return;
        }
        finish();
        void setSeed(seed).then(() => seedBtn.focus());
      } else if (e.key === "Escape") {
        finish();
        seedBtn.focus();
      }
    });
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
    input.addEventListener("blur", () => {
      if (!done) finish();
    });
    seedBtn.replaceWith(input);
    input.focus();
    input.select();
  }

  function perform(action: PaletteAction) {
    switch (action.type) {
      case "roll":
      case "run":
        return deps.run(action.line);
      case "switch":
        return void exec(`char ${action.name}`);
      case "scope":
        return palette.open(action.prefix);
      case "ui":
        switch (action.id) {
          case "new-character":
            return newCharacter();
          case "new-preset":
            return presetDialog(null);
          case "clear-log":
            return deps.clearLog();
          case "toggle-sidebar":
            return deps.toggleSidebar();
          case "set-seed":
            return editSeed();
          case "random-seed":
            return void setSeed(null);
        }
    }
  }

  const palette = mountPalette({
    state: deps.state,
    perform,
    edit: (row: PaletteRow) => {
      const p = row.preset;
      if (p) editPreset(p.name, p.source.kind === "global");
    },
  });

  sidebarBtn.addEventListener("click", deps.toggleSidebar);
  search.addEventListener("click", () => palette.open());
  seedBtn.addEventListener("click", editSeed);
  clearBtn.addEventListener("click", deps.clearLog);
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
  paintSeed();
  paintStatus();
  void refresh();

  return {
    async record(execution) {
      rolls += rollsIn(execution);
      event = eventFor(execution) ?? event;
      await refresh();
    },
    refresh,
    openPalette: (initial) => palette.open(initial),
    dispose() {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("rollin:edit-preset", onEdit);
    },
  };
}
