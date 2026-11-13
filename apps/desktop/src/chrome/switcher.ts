import { el } from "./dialog";
import { LIST_ROWS } from "./model";

export interface SwitcherDeps {
  /** Resolves to the library's error text, or null on success. */
  switchTo(name: string): Promise<string | null>;
  rename(from: string, to: string): Promise<string | null>;
  remove(name: string): Promise<string | null>;
  newCharacter(): void;
}

export interface Switcher {
  /** Redraws the button label and, if open, the menu. */
  update(characters: string[], active: string): void;
  open(): void;
  close(): void;
}

/** The toolbar's `grog ⌄` control and its menu. Rows switch; hovering or
 * focusing one reveals Rename and Delete (F2 and ⌫ from the keyboard). The
 * list shows `LIST_ROWS` rows before it scrolls. */
export function mountSwitcher(button: HTMLButtonElement, deps: SwitcherDeps): Switcher {
  let characters: string[] = [];
  let active = "";
  let menu: HTMLElement | null = null;
  let error = "";
  /** The row being renamed or confirmed for delete, and which. */
  let mode: { name: string; kind: "rename" | "delete" } | null = null;

  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");

  function paintButton() {
    button.replaceChildren(el("span", "tb-char", active || "—"), el("span", "tb-chev", "⌄"));
    button.setAttribute("aria-label", `Character: ${active}. Switch character`);
  }

  function rowFor(name: string): HTMLElement {
    const row = el("div", "sw-row");
    row.setAttribute("role", "none");
    const isActive = name === active;
    if (mode?.name === name && mode.kind === "rename") {
      const input = el("input", "sw-input");
      input.value = name;
      input.setAttribute("aria-label", `New name for ${name}`);
      input.spellcheck = false;
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const to = input.value.trim();
          if (to === "" || to === name) {
            mode = null;
            draw(name);
            return;
          }
          void deps.rename(name, to).then((err) => {
            error = err ?? "";
            if (err === null) {
              mode = null;
              close();
            } else draw();
          });
        } else if (e.key === "Escape") {
          mode = null;
          error = "";
          draw(name);
        }
      });
      row.append(el("span", "sw-check"), input);
      queueMicrotask(() => {
        input.focus();
        input.select();
      });
      return row;
    }
    if (mode?.name === name && mode.kind === "delete") {
      row.classList.add("is-confirm");
      const yes = el("button", "sw-confirm is-danger", "Delete");
      yes.type = "button";
      yes.setAttribute("aria-label", `Delete ${name}`);
      const no = el("button", "sw-confirm", "Cancel");
      no.type = "button";
      row.append(el("span", "sw-check"), el("span", "sw-name", `Delete ${name}?`), yes, no);
      yes.addEventListener("click", () =>
        void deps.remove(name).then((err) => {
          error = err ?? "";
          mode = null;
          if (err === null) close();
          else draw(name);
        }),
      );
      no.addEventListener("click", () => {
        mode = null;
        draw(name);
      });
      queueMicrotask(() => no.focus());
      return row;
    }

    const pick = el("button", "sw-pick");
    pick.type = "button";
    pick.dataset.name = name;
    pick.setAttribute("role", "menuitemradio");
    pick.setAttribute("aria-checked", String(isActive));
    pick.setAttribute("aria-keyshortcuts", name === "default" ? "Delete" : "F2 Delete");
    pick.append(el("span", "sw-check", isActive ? "✓" : ""), el("span", "sw-name", name));
    pick.addEventListener("click", () => {
      if (isActive) return close();
      void deps.switchTo(name).then((err) => {
        error = err ?? "";
        if (err === null) close();
        else draw(name);
      });
    });
    pick.addEventListener("keydown", (e) => {
      if (e.key === "F2" && name !== "default") {
        e.preventDefault();
        mode = { name, kind: "rename" };
        draw();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        mode = { name, kind: "delete" };
        draw();
      }
    });
    row.append(pick);
    const acts = el("span", "sw-acts");
    if (name !== "default") {
      const ren = el("button", "sw-act", "Rename");
      ren.type = "button";
      ren.tabIndex = -1;
      ren.setAttribute("aria-label", `Rename ${name}`);
      ren.addEventListener("click", () => {
        mode = { name, kind: "rename" };
        draw();
      });
      acts.append(ren);
    }
    const del = el("button", "sw-act is-danger", "Delete");
    del.type = "button";
    del.tabIndex = -1;
    del.setAttribute("aria-label", `Delete ${name}`);
    del.addEventListener("click", () => {
      mode = { name, kind: "delete" };
      draw();
    });
    acts.append(del);
    row.append(acts);
    return row;
  }

  function draw(focusName?: string) {
    if (!menu) return;
    const list = el("div", "sw-list");
    list.setAttribute("role", "none");
    list.style.maxHeight = `${LIST_ROWS * 28}px`;
    for (const name of characters) list.append(rowFor(name));
    const add = el("button", "sw-pick sw-new");
    add.type = "button";
    add.setAttribute("role", "menuitem");
    add.append(el("span", "sw-check", "+"), el("span", "sw-name", "New character…"));
    add.addEventListener("click", () => {
      close();
      deps.newCharacter();
    });
    const err = el("div", "sw-error", error);
    err.setAttribute("role", "alert");
    const sep = el("div", "sw-sep");
    sep.setAttribute("role", "separator");
    menu.replaceChildren(list, sep, add, err);
    if (focusName) menu.querySelector<HTMLElement>(`.sw-pick[data-name="${CSS.escape(focusName)}"]`)?.focus();
  }

  function close() {
    if (!menu) return;
    // Focus would otherwise fall to the page when the focused row goes away.
    const hadFocus = menu.contains(document.activeElement);
    menu.remove();
    menu = null;
    if (hadFocus) button.focus();
    mode = null;
    error = "";
    button.setAttribute("aria-expanded", "false");
    button.classList.remove("is-open");
    document.removeEventListener("mousedown", outside, true);
  }

  function outside(e: MouseEvent) {
    if (menu && !menu.contains(e.target as Node) && !button.contains(e.target as Node)) close();
  }

  function open() {
    if (menu) return;
    menu = el("div", "sw-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Characters");
    menu.id = "sw-menu";
    button.setAttribute("aria-controls", "sw-menu");
    const r = button.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 4}px`;
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "Tab") {
        // A menu is one stop: Tab leaves it and lands back on the button.
        e.preventDefault();
        close();
        button.focus();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const items = [...menu!.querySelectorAll<HTMLElement>(".sw-pick")];
        (e.key === "Home" ? items[0] : items[items.length - 1])?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...menu!.querySelectorAll<HTMLElement>(".sw-pick")];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    });
    document.body.append(menu);
    document.addEventListener("mousedown", outside, true);
    button.setAttribute("aria-expanded", "true");
    button.classList.add("is-open");
    draw(active);
  }

  button.addEventListener("click", () => (menu ? close() : open()));
  button.addEventListener("keydown", (e) => {
    if (!menu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      open();
    }
  });

  return {
    update(next, current) {
      characters = next;
      active = current;
      paintButton();
      if (menu) draw();
    },
    open,
    close,
  };
}
