import "./log.css";
import { renderEntry } from "./entry";
import { classify, isPrintable } from "./keys";
import { renderTree } from "./treeview";
import type { LogEntry } from "./model";

export type { LogEntry } from "./model";
export { renderEntry } from "./entry";

export interface LogOptions {
  /** Moves focus to the formula box. Called for Esc and for any printable key
   * the log does not use; that key is then typed in the box. */
  focusInput?: () => void;
  /** R: run this entry's input again. */
  reroll?: (entry: LogEntry) => void;
  /** Writes to the clipboard. Defaults to `navigator.clipboard`. */
  writeText?: (text: string) => Promise<void> | void;
}

export interface RollLog {
  /** Adds an entry at the bottom and scrolls to it. */
  append(entry: LogEntry): void;
  clear(): void;
  setCompact(compact: boolean): void;
  /** Esc from the formula box: focus the log, selecting the newest entry if none is. */
  focusLog(): void;
  /** Wires Esc in the formula box to `focusLog`. */
  bindInput(input: HTMLElement): void;
}

interface Item {
  entry: LogEntry;
  node: HTMLElement;
  tree: HTMLElement | null;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "entry-action";
  b.textContent = label;
  b.tabIndex = -1; // keyboard use goes through R and C
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** Turns `container` into the roll log: an `aria-live` region whose newest
 * entry sits at the bottom, just above the formula box. With focus, J/K move
 * a selection, ↵ opens the die tree, R rerolls, C copies. */
export function mountLog(container: HTMLElement, options: LogOptions = {}): RollLog {
  container.classList.add("roll-log-region");
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-relevant", "additions");
  container.tabIndex = 0;
  container.setAttribute("aria-label", "Roll log");
  container.setAttribute("aria-keyshortcuts", "J K Enter R C Escape");
  const list = document.createElement("div");
  list.className = "log-entries";
  // Spoken feedback for selection and actions; the live region above only
  // announces additions.
  const status = document.createElement("div");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  container.replaceChildren(list, status);

  const items: Item[] = [];
  let selected = -1;
  let seq = 0;
  const write = options.writeText ?? ((t: string) => navigator.clipboard.writeText(t));

  const say = (text: string) => {
    status.textContent = text;
  };

  const canExpand = (it: Item) => it.entry.result.ok && "doc" in it.entry.result && it.entry.result.doc.rolls.some((r) => r.expr.type !== "number");

  async function copy(it: Item, what: "text" | "json") {
    const r = it.entry.result;
    if (what === "json" && !(r.ok && "doc" in r)) return;
    // "copy" is the formula only, so it can be pasted straight back into the box.
    // The stored document is the `--json` document, so this matches the CLI.
    const body = what === "json" && r.ok && "doc" in r ? JSON.stringify(r.doc, null, 2) : it.entry.input;
    try {
      await write(body);
      say(what === "json" ? "Copied JSON" : "Copied");
    } catch {
      say("Copy failed");
    }
  }

  function toggle(it: Item) {
    if (!canExpand(it)) return;
    const r = it.entry.result;
    if (!r.ok || !("doc" in r)) return;
    const open = it.tree === null;
    if (open) {
      it.tree = document.createElement("div");
      it.tree.className = "entry-trees";
      for (const roll of r.doc.rolls) {
        if (roll.expr.type !== "number") it.tree.append(renderTree(roll));
      }
      it.node.append(it.tree);
    } else {
      it.tree?.remove();
      it.tree = null;
    }
    it.node.toggleAttribute("data-expanded", open);
    it.node.setAttribute("aria-expanded", String(open));
    say(open ? "Die tree shown" : "Die tree hidden");
  }

  function select(index: number, announce = true) {
    if (items.length === 0) return;
    const i = Math.max(0, Math.min(items.length - 1, index));
    if (selected >= 0) {
      items[selected]?.node.classList.remove("selected");
      items[selected]?.node.removeAttribute("aria-current");
    }
    selected = i;
    const it = items[i];
    it.node.classList.add("selected");
    it.node.setAttribute("aria-current", "true");
    container.setAttribute("aria-activedescendant", it.node.id);
    it.node.scrollIntoView?.({ block: "nearest" });
    if (announce) {
      const state = canExpand(it) ? (it.tree ? ", expanded" : ", collapsed") : "";
      say(`Entry ${i + 1} of ${items.length}: ${it.entry.input}${state}`);
    }
  }

  function leave() {
    options.focusInput?.();
  }

  container.addEventListener("keydown", (e) => {
    if (e.target !== container) return; // keys in a button or link are theirs
    const key = classify(e);
    if (key === null) {
      if (isPrintable(e)) leave(); // not prevented: the box receives the character
      return;
    }
    const it = items[selected];
    // J/K/R/C never reach the box while the log has focus.
    e.preventDefault();
    switch (key) {
      case "next":
        select(selected < 0 ? items.length - 1 : selected + 1);
        break;
      case "prev":
        select(selected < 0 ? items.length - 1 : selected - 1);
        break;
      case "toggle":
        if (it) toggle(it);
        break;
      case "reroll":
        if (it && options.reroll) {
          options.reroll(it.entry);
          say("Rerolled");
        }
        break;
      case "copy":
        if (it) void copy(it, "text");
        break;
      case "blur":
        leave();
        break;
    }
  });

  return {
    append(entry) {
      const node = renderEntry(entry, true);
      node.id = `log-entry-${++seq}`;
      node.removeAttribute("aria-current");
      const it: Item = { entry, node, tree: null };
      const actions = document.createElement("span");
      actions.className = "entry-actions";
      if (options.reroll) actions.append(button("reroll", () => { options.reroll?.(entry); say("Rerolled"); }));
      actions.append(button("copy", () => void copy(it, "text")));
      if (entry.result.ok && "doc" in entry.result) actions.append(button("copy json", () => void copy(it, "json")));
      node.querySelector(".entry-head")?.append(actions);
      node.addEventListener("click", () => {
        select(items.indexOf(it), false);
      });
      items.push(it);
      list.append(node);
      container.scrollTop = container.scrollHeight;
    },
    clear() {
      list.replaceChildren();
      items.length = 0;
      selected = -1;
      container.removeAttribute("aria-activedescendant");
    },
    setCompact(compact) {
      container.toggleAttribute("data-compact", compact);
    },
    focusLog() {
      container.focus();
      if (selected < 0) select(items.length - 1);
    },
    bindInput(input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !e.isComposing) {
          e.preventDefault();
          this.focusLog();
        }
      });
    },
  };
}
