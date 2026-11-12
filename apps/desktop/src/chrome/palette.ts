import { hasMod } from "../platform";
import { el } from "./dialog";
import { LIST_ROWS, paletteView, type PaletteAction, type PaletteRow, type PaletteView } from "./model";
import type { SessionStore } from "../store";

export interface PaletteDeps {
  /** The Session's saved data; the palette reads it each time it opens and while open. */
  store: SessionStore;
  /** Carries out a chosen row. */
  perform(action: PaletteAction): void;
  /** ⌘E on a preset row. */
  edit(row: PaletteRow): void;
}

export interface Palette {
  open(initial?: string): void;
  close(): void;
  isOpen(): boolean;
}

/** The ⌘K palette: one input, a listbox of presets and commands, and the
 * `@` and `>` scopes. The library of candidates is `paletteView`; this draws
 * it and handles the keys. */
export function mountPalette(deps: PaletteDeps): Palette {
  let root: HTMLElement | null = null;
  let before: HTMLElement | null = null;
  let unsubscribe: (() => void) | null = null;

  function close() {
    unsubscribe?.();
    unsubscribe = null;
    root?.remove();
    root = null;
    before?.focus?.();
  }

  function open(initial = "") {
    if (root) return;
    before = document.activeElement as HTMLElement | null;
    root = el("div", "pal-scrim");
    const box = el("div", "pal");
    const q = el("div", "pal-q");
    const chip = el("span", "pal-chip");
    chip.hidden = true;
    const input = el("input", "pal-input");
    input.type = "text";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.placeholder = "Search presets or commands";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", "pal-list");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-label", "Search presets, characters and commands");
    q.append(chip, input);
    const list = el("div", "pal-list");
    list.id = "pal-list";
    list.setAttribute("role", "listbox");
    list.style.maxHeight = `${LIST_ROWS * 28 + 8}px`;
    const foot = el("div", "pal-foot", "⏎ run   ↑↓ move   esc close");
    box.append(q, list, foot);
    root.append(box);
    document.body.append(root);

    let view: PaletteView = { scope: "all", headings: new Map(), rows: [] };
    let active = 0;
    // The text after the scope prefix is what the input holds when scoped.
    let prefix = "";

    const query = () => prefix + input.value;

    function paint() {
      const state = deps.store.state;
      if (!state) {
        list.replaceChildren(el("div", "pal-empty", deps.store.error || "Could not read saved data."));
        return;
      }
      view = paletteView(state, query());
      active = Math.min(active, Math.max(view.rows.length - 1, 0));
      chip.hidden = prefix === "";
      chip.textContent = prefix === "@" ? "@ characters" : prefix === ">" ? "> commands" : "";
      list.replaceChildren();
      if (view.rows.length === 0) {
        list.append(el("div", "pal-empty", "Nothing matches."));
      }
      view.rows.forEach((row, i) => {
        const heading = view.headings.get(i);
        if (heading) list.append(el("div", "pal-group", heading));
        const item = el("div", "pal-row");
        item.id = `pal-row-${i}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(i === active));
        item.classList.toggle("is-active", i === active);
        item.append(el("span", "pal-label", row.label));
        if (row.detail) item.append(el("span", `pal-detail${row.kind === "preset" ? " is-mono" : ""}`, row.detail));
        item.addEventListener("mousemove", () => {
          if (active !== i) {
            active = i;
            paint();
          }
        });
        item.addEventListener("click", () => choose(row));
        list.append(item);
      });
      input.setAttribute("aria-activedescendant", view.rows.length ? `pal-row-${active}` : "");
      list.querySelector(".is-active")?.scrollIntoView?.({ block: "nearest" });
    }

    function choose(row: PaletteRow) {
      if (row.action.type === "scope") {
        prefix = row.action.prefix;
        input.value = "";
        active = 0;
        paint();
        input.focus();
        return;
      }
      close();
      deps.perform(row.action);
    }

    // `@` or `>` at the start of an empty box becomes the scope chip, and
    // Backspace on an empty scoped box takes it off again.
    input.addEventListener("input", () => {
      if (prefix === "" && (input.value === "@" || input.value === ">")) {
        prefix = input.value;
        input.value = "";
      }
      active = 0;
      paint();
    });
    input.addEventListener("keydown", (e) => {
      const n = view.rows.length;
      if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
        e.preventDefault();
        if (n) active = (active + 1) % n;
        paint();
      } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
        e.preventDefault();
        if (n) active = (active - 1 + n) % n;
        paint();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = view.rows[active];
        if (row) choose(row);
      } else if (e.key === "Backspace" && input.value === "" && prefix !== "") {
        e.preventDefault();
        prefix = "";
        paint();
      } else if (e.key === "e" && hasMod(e)) {
        const row = view.rows[active];
        if (row?.preset) {
          e.preventDefault();
          close();
          deps.edit(row);
        }
      }
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });
    root.addEventListener("mousedown", (e) => {
      if (e.target === root) close();
    });

    if (initial === "@" || initial === ">") prefix = initial;
    else input.value = initial;
    unsubscribe = deps.store.subscribe(paint);
    paint();
    input.focus();
  }

  return { open, close, isOpen: () => root !== null };
}
