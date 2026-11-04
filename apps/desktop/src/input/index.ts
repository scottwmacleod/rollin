import "./input.css";
import * as api from "../api";
import type { Completions, Execution } from "../api";
import { commonPrefix, History, isFormulaLine, pieces } from "./words";

export { isFormulaLine, pieces, commonPrefix, History } from "./words";

/** The three commands the box needs; injectable for tests. */
export interface InputApi {
  check(formula: string): Promise<void>;
  complete(line: string, pos: number): Promise<Completions>;
  execute(line: string): Promise<Execution>;
}

export interface InputOptions {
  /** Called with an accepted line and its result (anything but an error). */
  onSubmit?: (line: string, execution: Execution) => void;
  /** Earlier input to seed ↑ with, oldest first (`SessionState.history`). */
  history?: string[];
  /** Quiet period before the live parse runs. Default 150 ms. */
  debounceMs?: number;
  api?: InputApi;
}

export interface FormulaInput {
  focus(): void;
  value(): string;
  setValue(text: string): void;
  setCompact(compact: boolean): void;
  /** Removes the window key handler. */
  dispose(): void;
}

/** The library's message for a rejected command, verbatim. */
function messageOf(failure: unknown): string {
  const f = failure as { error?: { message?: unknown }; message?: unknown } | null;
  if (typeof f?.error?.message === "string") return f.error.message;
  if (typeof f?.message === "string") return f.message;
  return String(failure);
}

let counter = 0;

/** Turns `container` into the formula box: the one place typing goes. */
export function mountInput(container: HTMLElement, options: InputOptions = {}): FormulaInput {
  const backend: InputApi = options.api ?? api;
  const debounceMs = options.debounceMs ?? 150;
  const history = new History(options.history);
  const id = `fx${++counter}`;

  container.classList.add("formula-mounted");
  container.removeAttribute("aria-label");

  const label = document.createElement("label");
  label.className = "fx-sr";
  label.htmlFor = `${id}-input`;
  label.textContent = "Formula";

  const field = document.createElement("div");
  field.className = "fx-field";
  const prompt = document.createElement("span");
  prompt.className = "fx-prompt";
  prompt.setAttribute("aria-hidden", "true");
  prompt.textContent = "›";
  const text = document.createElement("div");
  text.className = "fx-text";
  const highlight = document.createElement("div");
  highlight.className = "fx-highlight";
  highlight.setAttribute("aria-hidden", "true");
  const input = document.createElement("input");
  input.className = "fx-input";
  input.id = `${id}-input`;
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", `${id}-list`);
  input.setAttribute("aria-describedby", `${id}-error`);
  input.setAttribute("aria-keyshortcuts", "Tab ArrowUp ArrowDown Enter");
  input.setAttribute("aria-invalid", "false");
  text.append(highlight, input);
  field.append(prompt, text);

  const error = document.createElement("div");
  error.className = "fx-error";
  error.id = `${id}-error`;
  error.setAttribute("role", "status");
  error.hidden = true;

  const list = document.createElement("ul");
  list.className = "fx-list";
  list.id = `${id}-list`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Completions");
  list.hidden = true;

  container.replaceChildren(label, list, field, error);

  // --- rendering -----------------------------------------------------------

  function paint(): void {
    highlight.replaceChildren(
      ...pieces(input.value).map((p) => {
        if (p.kind === "plain") return document.createTextNode(p.text);
        const span = document.createElement("span");
        span.className = p.kind === "variable" ? "fx-variable" : "fx-label";
        span.textContent = p.text;
        return span;
      }),
    );
    highlight.scrollLeft = input.scrollLeft;
  }

  function showError(message: string | null): void {
    error.hidden = message === null;
    error.textContent = message ?? "";
    field.classList.toggle("invalid", message !== null);
    input.setAttribute("aria-invalid", String(message !== null));
  }

  // --- completion list -----------------------------------------------------

  let candidates: string[] = [];
  let listStart = 0;
  let active = -1;

  function closeList(): void {
    candidates = [];
    active = -1;
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function setActive(i: number): void {
    active = i;
    [...list.children].forEach((li, n) => li.setAttribute("aria-selected", String(n === i)));
    if (i >= 0) {
      input.setAttribute("aria-activedescendant", `${id}-opt${i}`);
      list.children[i]?.scrollIntoView?.({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function openList(start: number, words: string[]): void {
    candidates = words;
    listStart = start;
    list.replaceChildren(
      ...words.map((w, i) => {
        const li = document.createElement("li");
        li.className = "fx-option";
        li.id = `${id}-opt${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.textContent = w;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault(); // keep focus in the box
          accept(i);
        });
        return li;
      }),
    );
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    active = -1;
  }

  /** Replaces the word the list was opened for with `replacement`. */
  function insert(start: number, end: number, replacement: string): void {
    const v = input.value;
    input.value = v.slice(0, start) + replacement + v.slice(end);
    const caret = start + replacement.length;
    input.setSelectionRange(caret, caret);
    edited();
  }

  function accept(i: number): void {
    const word = candidates[i];
    if (word === undefined) return;
    const end = input.selectionStart ?? input.value.length;
    insert(listStart, end, word);
    closeList();
  }

  let completing = 0;
  async function tab(): Promise<void> {
    if (active >= 0) return accept(active);
    const mine = ++completing;
    const pos = input.selectionStart ?? input.value.length;
    const line = input.value;
    let result: Completions;
    try {
      result = await backend.complete(line, pos);
    } catch {
      return;
    }
    if (mine !== completing || input.value !== line) return; // typed meanwhile
    const words = result.candidates;
    if (words.length === 0) return closeList();
    // Like the REPL: extend to the common prefix, and list if still ambiguous.
    const prefix = commonPrefix(words);
    const typed = line.slice(result.start, pos);
    if (prefix.length > typed.length) insert(result.start, pos, prefix);
    if (words.length === 1) return closeList();
    openList(result.start, words);
  }

  // --- live parse ----------------------------------------------------------

  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  /** Parses `line` through `check`; null if fine (or not a formula). */
  async function problem(line: string): Promise<string | null> {
    if (!isFormulaLine(line)) return null;
    try {
      await backend.check(line);
      return null;
    } catch (failure) {
      return messageOf(failure);
    }
  }

  function live(): void {
    clearTimeout(timer);
    const line = input.value;
    const mine = ++seq;
    if (!isFormulaLine(line)) return showError(null);
    timer = setTimeout(() => {
      void problem(line).then((message) => {
        if (mine === seq) showError(message);
      });
    }, debounceMs);
  }

  function edited(): void {
    completing++;
    paint();
    live();
  }

  // --- submit --------------------------------------------------------------

  let busy = false;
  async function submit(): Promise<void> {
    const line = input.value;
    if (line.trim() === "" || busy) return;
    busy = true;
    clearTimeout(timer);
    seq++; // drop any pending live parse
    try {
      const bad = await problem(line);
      if (bad !== null) return showError(bad);
      const execution = await backend.execute(line);
      if (execution.status === "error") return showError(execution.error.message);
      if (execution.status === "rejected") return showError(execution.message);
      showError(null);
      history.push(line);
      input.value = "";
      closeList();
      paint();
      options.onSubmit?.(line, execution);
    } catch (failure) {
      showError(messageOf(failure));
    } finally {
      busy = false;
    }
  }

  // --- keys ----------------------------------------------------------------

  function recall(line: string | null): void {
    if (line === null) return;
    input.value = line;
    input.setSelectionRange(line.length, line.length);
    paint();
    live();
  }

  input.addEventListener("input", () => {
    history.reset();
    closeList();
    edited();
  });
  input.addEventListener("scroll", () => {
    highlight.scrollLeft = input.scrollLeft;
  });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    const open = candidates.length > 0;
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (open && active >= 0) accept(active);
        else void submit();
        break;
      case "Tab":
        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        void tab();
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setActive(active <= 0 ? candidates.length - 1 : active - 1);
        else recall(history.prev(input.value));
        break;
      case "ArrowDown":
        e.preventDefault();
        if (open) setActive(active + 1 >= candidates.length ? 0 : active + 1);
        else recall(history.next());
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopImmediatePropagation(); // closes the list; the log hears the next Esc
          closeList();
        }
        break;
    }
  });
  input.addEventListener("blur", () => closeList());

  // Any printable key in the window is typed here, unless it is going to a
  // field already or to the log (which hands back the keys it does not use).
  const onWindowKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return;
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target === input) return;
    if (target?.closest("input, textarea, select, [contenteditable='true'], .roll-log-region, [role='dialog']")) return;
    input.focus();
    // The key is not re-dispatched; insert it where the caret is.
    e.preventDefault();
    const s = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? s;
    input.setRangeText(e.key, s, end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  document.addEventListener("keydown", onWindowKey);

  paint();

  return {
    focus: () => input.focus(),
    value: () => input.value,
    setValue(v) {
      input.value = v;
      closeList();
      edited();
    },
    setCompact: (compact) => container.classList.toggle("compact", compact),
    dispose: () => document.removeEventListener("keydown", onWindowKey),
  };
}
