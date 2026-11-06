import { commands } from "../sidebar/model";
import type { PresetEntry, SessionState } from "../api/types";

/** A modal dialog frame: scrim, title, body, footer. Esc closes it, Tab stays
 * inside it, and focus goes back to where it was. */
export interface Dialog {
  root: HTMLElement;
  close(): void;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

let counter = 0;

export function openDialog(title: string, body: HTMLElement, footer: HTMLElement): Dialog {
  const before = document.activeElement as HTMLElement | null;
  const root = el("div", "dlg-scrim");
  const box = el("div", "dlg");
  const heading = el("h2", "dlg-title", title);
  heading.id = `dlg-title-${++counter}`;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", heading.id);
  box.append(heading, body, footer);
  root.append(box);

  const close = () => {
    root.remove();
    document.removeEventListener("keydown", onKey, true);
    before?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      const items = [...box.querySelectorAll<HTMLElement>("input, button:not([disabled])")];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener("keydown", onKey, true);
  root.addEventListener("mousedown", (e) => {
    if (e.target === root) close();
  });
  document.body.append(root);
  queueMicrotask(() => box.querySelector<HTMLElement>("input")?.focus());
  return { root, close };
}

function field(label: string, input: HTMLInputElement, note: HTMLElement): HTMLElement {
  const wrap = el("div", "dlg-field");
  const id = `dlg-in-${++counter}`;
  const lab = el("label", "", label);
  lab.htmlFor = id;
  input.id = id;
  input.className = "dlg-input";
  input.spellcheck = false;
  input.autocomplete = "off";
  note.id = `${id}-note`;
  input.setAttribute("aria-describedby", note.id);
  wrap.append(lab, input, note);
  return wrap;
}

function note(): HTMLElement {
  const n = el("div", "dlg-note");
  n.setAttribute("aria-live", "polite");
  return n;
}

function button(label: string, cls = ""): HTMLButtonElement {
  const b = el("button", `dlg-btn ${cls}`.trim(), label);
  b.type = "button";
  return b;
}

const SHAPE = /^[A-Za-z][A-Za-z0-9_-]*$/;

function setNote(n: HTMLElement, input: HTMLInputElement, text: string, error: boolean) {
  n.textContent = text;
  n.classList.toggle("is-error", error);
  input.toggleAttribute("aria-invalid", error);
  if (!error) input.removeAttribute("aria-invalid");
}

/** Reasons a name cannot work that the dialog can tell without asking the
 * library; the library still has the last word on submit. */
export function nameProblem(name: string, taken: string[], what: string): string | null {
  if (name === "") return "";
  if (!SHAPE.test(name)) return "Start with a letter; use letters, digits, - and _.";
  if (taken.includes(name.toLowerCase())) return `${what} ${name.toLowerCase()} already exists.`;
  return null;
}

export interface NewCharacterDeps {
  characters: string[];
  /** Runs `char new`; resolves to the library's error text, or null on success. */
  create(name: string): Promise<string | null>;
}

export function openNewCharacter(deps: NewCharacterDeps): Dialog {
  const input = el("input");
  const msg = note();
  const body = el("div", "dlg-body");
  body.append(field("Name", input, msg));
  const cancel = button("Cancel");
  const create = button("Create", "is-primary");
  create.disabled = true;
  const footer = el("div", "dlg-footer");
  footer.append(cancel, create);
  const dialog = openDialog("New character", body, footer);

  const check = () => {
    const problem = nameProblem(input.value.trim(), deps.characters.map((c) => c.toLowerCase()), "A character named");
    create.disabled = problem !== null;
    setNote(msg, input, problem ?? "", !!problem);
    return problem === null;
  };
  const submit = async () => {
    if (!check()) return;
    create.disabled = true;
    const error = await deps.create(input.value.trim());
    if (error === null) dialog.close();
    else {
      setNote(msg, input, error, true);
      create.disabled = false;
    }
  };
  input.addEventListener("input", check);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  });
  cancel.addEventListener("click", dialog.close);
  create.addEventListener("click", () => void submit());
  return dialog;
}

/** The command lines that save a preset and, for a rename or a move between
 * character and global, remove the old one. Save comes first, so a failure
 * never loses the preset. */
export function presetSaveLines(
  original: { name: string; global: boolean } | null,
  next: { name: string; formula: string; global: boolean },
): string[] {
  const lines = [commands.savePreset(next.name, next.formula, next.global)];
  if (original && (original.name !== next.name.toLowerCase() || original.global !== next.global)) {
    lines.push(commands.deletePreset(original.name, original.global));
  }
  return lines;
}

/** The existing preset that saving here would replace, if any. */
export function presetClash(
  state: Pick<SessionState, "presets" | "global_presets">,
  original: { name: string; global: boolean } | null,
  name: string,
  global: boolean,
): PresetEntry | null {
  const lower = name.trim().toLowerCase();
  if (original && original.name === lower && original.global === global) return null;
  return (global ? state.global_presets : state.presets).find((p) => p.name === lower) ?? null;
}

export interface PresetDialogDeps {
  state: SessionState;
  /** Set when editing; null for a new preset. */
  original: { name: string; formula: string; global: boolean } | null;
  /** Resolves if the formula would roll; rejects with the library's failure. */
  check(formula: string): Promise<void>;
  describe(failure: unknown): string;
  /** Runs the lines in order; resolves to the first error text, or null. */
  apply(lines: string[]): Promise<string | null>;
  remove(name: string, global: boolean): Promise<string | null>;
}

export function openPresetDialog(deps: PresetDialogDeps): Dialog {
  const { state, original } = deps;
  const nameIn = el("input");
  const nameNote = note();
  const formulaIn = el("input");
  formulaIn.classList.add("is-mono");
  const formulaNote = note();
  nameIn.value = original?.name ?? "";
  formulaIn.value = original?.formula ?? "";

  let global = original?.global ?? false;
  const scope = el("div", "dlg-field");
  const scopeLabel = el("span", "", "Saved for");
  scopeLabel.id = `dlg-scope-${++counter}`;
  const seg = el("div", "dlg-seg");
  seg.setAttribute("role", "radiogroup");
  seg.setAttribute("aria-labelledby", scopeLabel.id);
  const own = button(state.active_character);
  const all = button("Everyone (global)");
  for (const [b, g] of [[own, false], [all, true]] as const) {
    b.setAttribute("role", "radio");
    b.addEventListener("click", () => {
      global = g;
      paintScope();
      validate();
    });
  }
  const paintScope = () => {
    own.setAttribute("aria-checked", String(!global));
    all.setAttribute("aria-checked", String(global));
    own.classList.toggle("is-on", !global);
    all.classList.toggle("is-on", global);
  };
  seg.append(own, all);
  scope.append(scopeLabel, seg);
  paintScope();

  const body = el("div", "dlg-body");
  body.append(
    field("Name", nameIn, nameNote),
    field("Formula", formulaIn, formulaNote),
    scope,
  );
  const footer = el("div", "dlg-footer");
  const del = button("Delete", "is-danger");
  const cancel = button("Cancel");
  const save = button("Save", "is-primary");
  if (original) footer.append(del);
  footer.append(cancel, save);
  const dialog = openDialog(original ? "Edit preset" : "New preset", body, footer);
  if (original) del.style.marginRight = "auto";

  let formulaOk = original !== null;
  let seq = 0;
  const validate = () => {
    const name = nameIn.value.trim();
    const problem = nameProblem(name, [], "");
    setNote(nameNote, nameIn, problem ?? "", !!problem);
    const clash = problem === null ? presetClash(state, original && { name: original.name, global: original.global }, name, global) : null;
    if (clash) {
      setNote(nameNote, nameIn, `Replaces your existing ${clash.name} (${clash.formula}).`, false);
    }
    save.textContent = clash ? "Replace" : "Save";
    save.disabled = problem !== null || !formulaOk || formulaIn.value.trim() === "";
  };
  const checkFormula = () => {
    const mine = ++seq;
    const f = formulaIn.value.trim();
    if (f === "") {
      formulaOk = false;
      setNote(formulaNote, formulaIn, "", false);
      validate();
      return;
    }
    deps.check(f).then(
      () => {
        if (mine !== seq) return;
        formulaOk = true;
        setNote(formulaNote, formulaIn, "", false);
        validate();
      },
      (failure) => {
        if (mine !== seq) return;
        formulaOk = false;
        setNote(formulaNote, formulaIn, deps.describe(failure), true);
        validate();
      },
    );
  };
  nameIn.addEventListener("input", validate);
  formulaIn.addEventListener("input", checkFormula);
  const submit = async () => {
    if (save.disabled) return;
    save.disabled = true;
    const lines = presetSaveLines(original && { name: original.name, global: original.global }, {
      name: nameIn.value.trim(),
      formula: formulaIn.value.trim(),
      global,
    });
    const error = await deps.apply(lines);
    if (error === null) dialog.close();
    else {
      setNote(formulaNote, formulaIn, error, true);
      save.disabled = false;
    }
  };
  for (const input of [nameIn, formulaIn]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    });
  }
  save.addEventListener("click", () => void submit());
  cancel.addEventListener("click", dialog.close);
  del.addEventListener("click", () => {
    if (!original) return;
    void deps.remove(original.name, original.global).then((error) => {
      if (error === null) dialog.close();
      else setNote(formulaNote, formulaIn, error, true);
    });
  });
  if (original) checkFormula();
  validate();
  return dialog;
}
