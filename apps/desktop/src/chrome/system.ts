import type { SessionState } from "../api/generated";
import { el } from "./dialog";

const SYSTEM_NAMES: Record<string, string> = { dnd5e: "D&D 5e" };

/** The name a person knows a game system by; unknown ids show as they are. */
export function systemName(id: string): string {
  return SYSTEM_NAMES[id] ?? id;
}

/** The status-bar text for the system in force. */
export function systemLabel(s: Pick<SessionState, "effective_system">): string {
  const id = s.effective_system;
  return id === null ? "no system" : systemName(id);
}

export interface SystemDeps {
  /** Resolves to the library's error text, or null on success. */
  set(scope: "character" | "default", system: string | null): Promise<string | null>;
}

export interface SystemMenu {
  /** Redraws the chip and, if open, the popover. */
  update(state: SessionState): void;
  close(): void;
}

/** The status bar's system chip. Clicking it opens a popover with the active
 * character's own system and the global default; both write the same TOML the
 * CLI reads. The character's choice can be "use the default". */
export function mountSystemChip(chip: HTMLButtonElement, deps: SystemDeps): SystemMenu {
  let state: SessionState | null = null;
  let pop: HTMLElement | null = null;
  let error = "";

  chip.setAttribute("aria-haspopup", "dialog");
  chip.setAttribute("aria-expanded", "false");

  function paintChip() {
    if (!state) return;
    chip.textContent = systemLabel(state);
    chip.setAttribute("aria-label", `Game system: ${systemLabel(state)}. Change`);
  }

  function select(label: string, value: string, options: [string, string][], scope: "character" | "default") {
    const row = el("label", "sys-row");
    row.append(el("span", "sys-label", label));
    const sel = el("select", "sys-select");
    for (const [v, text] of options) {
      const o = el("option", "", text);
      o.value = v;
      sel.append(o);
    }
    sel.value = value;
    sel.addEventListener("change", () => {
      void deps.set(scope, sel.value === "" ? null : sel.value).then((err) => {
        error = err ?? "";
        draw();
      });
    });
    row.append(sel);
    return row;
  }

  function draw() {
    if (!pop || !state) return;
    const s = state;
    const named: [string, string][] = s.systems.map((name) => [name, systemName(name)]);
    const inherit = s.default_system ? `Use default (${systemName(s.default_system)})` : "Use default (no system)";
    const err = el("div", "sys-error", error);
    err.setAttribute("role", "alert");
    pop.replaceChildren(
      el("div", "sys-title", "Game system"),
      select(`${s.active_character}`, s.system ?? "", [["", inherit], ...named], "character"),
      select("Default", s.default_system ?? "", [["", "No system"], ...named], "default"),
      el("p", "sys-hint", "A system gives rolls meaning, such as critical hits. A character's own choice wins over the default."),
      err,
    );
  }

  function close() {
    if (!pop) return;
    pop.remove();
    pop = null;
    error = "";
    chip.setAttribute("aria-expanded", "false");
    chip.classList.remove("is-open");
    document.removeEventListener("mousedown", outside, true);
  }

  function outside(e: MouseEvent) {
    if (pop && !pop.contains(e.target as Node) && !chip.contains(e.target as Node)) close();
  }

  function open() {
    if (pop || !state) return;
    pop = el("div", "sys-pop");
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Game system");
    const r = chip.getBoundingClientRect();
    pop.style.left = `${r.left}px`;
    // The status bar is at the bottom: open upward.
    pop.style.bottom = `${window.innerHeight - r.top + 4}px`;
    pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        chip.focus();
      }
    });
    document.body.append(pop);
    document.addEventListener("mousedown", outside, true);
    chip.setAttribute("aria-expanded", "true");
    chip.classList.add("is-open");
    draw();
    pop.querySelector<HTMLElement>("select")?.focus();
  }

  chip.addEventListener("click", () => (pop ? close() : open()));

  return {
    update(next) {
      state = next;
      paintChip();
      if (pop) draw();
    },
    close,
  };
}
