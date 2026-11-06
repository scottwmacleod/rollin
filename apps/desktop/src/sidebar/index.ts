import "./sidebar.css";
import type { Execution, SessionState } from "../api/types";
import { commands, presetRows, type PresetRow } from "./model";

export { presetRows } from "./model";

export interface SidebarDeps {
  /** Runs a line as typed (`api.execute`). */
  execute(line: string): Promise<Execution>;
  /** Reads the sidebar's data (`api.state`). */
  state(): Promise<SessionState>;
  /** Rolls a line into the log exactly as if it had been typed and submitted. */
  run(line: string): void;
}

export interface Sidebar {
  refresh(): Promise<void>;
  /** ⌘B: hides or shows the sidebar (a slide-over below 960px). */
  toggle(): void;
  /** Rolls the nth displayed preset (1–9). False if there is none. */
  rollShortcut(n: number): boolean;
}

const NARROW = "(max-width: 959px)";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function failureText(r: Execution): string | null {
  if (r.status === "error") return r.error.message;
  if (r.status === "rejected") return r.message;
  return null;
}

export function mountSidebar(container: HTMLElement, deps: SidebarDeps): Sidebar {
  container.classList.add("sidebar-root");
  const app = container.parentElement;
  let current: SessionState | null = null;
  let rows: PresetRow[] = [];
  let errorText = "";
  let menu: HTMLElement | null = null;
  const narrow = () => window.matchMedia?.(NARROW).matches ?? false;

  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };

  const refresh = async () => {
    try {
      current = await deps.state();
    } catch (e) {
      current = null;
      errorText = (e as { error?: { message?: string } })?.error?.message ?? "Could not read saved data.";
    }
    render();
  };

  /** Runs an edit; on failure keeps the CLI's message visible, else reloads. */
  const edit = async (line: string): Promise<boolean> => {
    const r = await deps.execute(line);
    const failure = failureText(r);
    errorText = failure ?? "";
    await refresh();
    return failure === null;
  };

  function header(text: string): HTMLElement {
    return el("h2", "sb-header", text);
  }

  function inlineInput(initial: string, label: string, onCommit: (v: string) => void, onCancel: () => void) {
    const input = el("input", "sb-input");
    input.value = initial;
    input.setAttribute("aria-label", label);
    input.spellcheck = false;
    let done = false;
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        done = true;
        onCommit(input.value);
      } else if (e.key === "Escape") {
        done = true;
        onCancel();
      }
    });
    input.addEventListener("blur", () => {
      if (!done) onCancel();
    });
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
    return input;
  }

  function varRow(name: string, value: number): HTMLElement {
    const li = el("li", "sb-row");
    const b = el("button", "sb-var");
    b.type = "button";
    b.setAttribute("aria-label", `Edit @${name}, currently ${value}`);
    b.append(el("span", "sb-var-name", `@${name}`), el("span", "sb-var-value", String(value)));
    b.addEventListener("click", () => {
      const input = inlineInput(
        String(value),
        `Value of @${name}`,
        (v) => void edit(commands.setVar(name, v)),
        () => render(),
      );
      b.replaceWith(input);
    });
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMenu(b, [["Delete", () => void edit(commands.unsetVar(name))]], e);
    });
    li.append(b);
    return li;
  }

  function addVarRow(): HTMLElement {
    const li = el("li", "sb-row");
    const b = el("button", "sb-add", "+ Add variable");
    b.type = "button";
    b.addEventListener("click", () => {
      const input = inlineInput(
        "",
        "New variable as name value, for example str 3",
        (v) => {
          const [name, value = ""] = v.trim().replace(/^@/, "").split(/\s+/, 2);
          if (!name) return render();
          void edit(commands.setVar(name, value));
        },
        () => render(),
      );
      input.placeholder = "name value";
      b.replaceWith(input);
    });
    li.append(b);
    return li;
  }

  function presetRow(row: PresetRow): HTMLElement {
    const { entry } = row;
    const li = el("li", "sb-row");
    const b = el("button", "sb-preset");
    b.type = "button";
    if (row.shadowed) {
      b.classList.add("is-shadowed");
      b.setAttribute("aria-disabled", "true");
      const by = entry.shadow.kind === "shadowed_by" ? entry.shadow.by : "";
      b.title = `Shadowed by ${by}'s preset of the same name`;
    }
    b.append(
      el("span", "sb-play", "▶"),
      el("span", "sb-preset-name", entry.name),
      el("span", "sb-preset-formula", entry.formula),
    );
    if (row.shortcut) b.setAttribute("aria-keyshortcuts", `Meta+${row.shortcut}`);
    b.setAttribute(
      "aria-label",
      row.shadowed ? `${entry.name}, shadowed` : `Roll ${entry.name}, ${entry.formula}`,
    );
    b.addEventListener("click", () => {
      if (!row.shadowed) deps.run(entry.name);
    });
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const global = row.scope === "global";
      const items: [string, () => void][] = [];
      if (!row.shadowed) {
        items.push([
          "Edit",
          () => window.dispatchEvent(new CustomEvent("rollin:edit-preset", { detail: { name: entry.name, global } })),
        ]);
        if (!global) {
          items.push([
            "Make global",
            () =>
              void (async () => {
                if (await edit(commands.savePreset(entry.name, entry.formula, true))) {
                  await edit(commands.deletePreset(entry.name, false));
                }
              })(),
          ]);
        }
      }
      items.push(["Delete", () => void edit(commands.deletePreset(entry.name, global))]);
      openMenu(b, items, e);
    });
    li.append(b);
    return li;
  }

  function openMenu(anchor: HTMLElement, items: [string, () => void][], e: MouseEvent) {
    closeMenu();
    const m = el("div", "sb-menu");
    m.setAttribute("role", "menu");
    for (const [label, act] of items) {
      const mi = el("button", "sb-menu-item", label);
      mi.type = "button";
      mi.setAttribute("role", "menuitem");
      mi.addEventListener("click", () => {
        closeMenu();
        act();
      });
      m.append(mi);
    }
    m.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        closeMenu();
        anchor.focus();
      }
    });
    m.style.left = `${e.clientX}px`;
    m.style.top = `${e.clientY}px`;
    document.body.append(m);
    menu = m;
    (m.firstElementChild as HTMLElement | null)?.focus();
  }

  function render() {
    closeMenu();
    const s = current;
    const body: Node[] = [];
    if (s) {
      rows = presetRows(s);
      const vars = el("ul", "sb-list");
      for (const [n, v] of s.vars) vars.append(varRow(n, v));
      vars.append(addVarRow());
      const char = rows.filter((r) => r.scope === "character");
      const glob = rows.filter((r) => r.scope === "global");
      const presets = el("ul", "sb-list");
      for (const r of char) presets.append(presetRow(r));
      const globals = el("ul", "sb-list");
      for (const r of glob) globals.append(presetRow(r));
      body.push(header(`Variables · ${s.active_character}`), vars, header("Presets"), presets);
      body.push(header("Global"), globals);
    } else {
      rows = [];
    }
    const err = el("div", "sb-error", errorText);
    err.setAttribute("role", "alert");
    container.replaceChildren(...body, err);
  }

  document.addEventListener("click", (e) => {
    if (menu && !menu.contains(e.target as Node)) closeMenu();
  });

  const toggle = () => {
    // Each class applies only in its own width range; flip the one in force.
    app?.classList.toggle(narrow() ? "sidebar-open" : "sidebar-collapsed");
  };

  const rollShortcut = (n: number) => {
    const row = rows.find((r) => r.shortcut === n);
    if (!row) return false;
    deps.run(row.entry.name);
    return true;
  };

  document.addEventListener("keydown", (e) => {
    if (!e.metaKey || e.altKey || e.ctrlKey) return;
    if (e.key.toLowerCase() === "b") {
      e.preventDefault();
      toggle();
    } else if (/^[1-9]$/.test(e.key) && rollShortcut(Number(e.key))) {
      e.preventDefault();
    }
  });

  // Picking something in the slide-over closes it.
  container.addEventListener("click", (e) => {
    if (narrow() && (e.target as HTMLElement).closest(".sb-preset")) app?.classList.remove("sidebar-open");
  });

  void refresh();
  return { refresh, toggle, rollShortcut };
}
