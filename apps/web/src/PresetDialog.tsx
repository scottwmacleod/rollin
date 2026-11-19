import { checkFormula, spanOf, validatePresetName } from "@rollin/engine";
import { type FormEvent, useState } from "react";
import { caretLines } from "./caret";
import type { Character } from "./characters";
import { CONFIRM_NO, CONFIRM_YES, FIELD, OVERLAY, PRIMARY, SECONDARY } from "./dialogStyles";
import type { PresetMap, PresetScope } from "./presets";
import {
  Button,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from "./ui";

/** What the dialog is doing: making a preset (maybe from a typed formula) or editing a saved one. */
export type PresetDialogMode =
  | { kind: "new"; formula: string }
  | { kind: "edit"; name: string; scope: PresetScope };

/** A preset's place in the saved data: its name and where it lives. */
export interface PresetRef {
  name: string;
  scope: PresetScope;
}

/**
 * The edit-preset dialog (#86, option A): name, formula with a live check,
 * scope (this character or every character), Delete, Cancel and Save. The same
 * dialog makes a new preset. The button says Replace when the name is already
 * taken in that scope. A rename or a change of scope saves the new preset and
 * removes the old one.
 */
export function PresetDialog({
  mode,
  presets,
  character,
  onSave,
  onDelete,
  onClose,
}: {
  mode: PresetDialogMode;
  /** The global presets. */
  presets: PresetMap;
  /** The active character, whose own presets shadow the global ones. */
  character: Character;
  /** `from` is the preset being edited, if any. Resolves when the save has been stored. */
  onSave: (
    name: string,
    formula: string,
    scope: PresetScope,
    from: PresetRef | null,
  ) => Promise<void>;
  onDelete: (ref: PresetRef) => Promise<void>;
  onClose: () => void;
}) {
  const from: PresetRef | null =
    mode.kind === "edit" ? { name: mode.name, scope: mode.scope } : null;
  const editing = from?.name ?? null;
  const [name, setName] = useState(editing ?? "");
  const [scope, setScope] = useState<PresetScope>(from?.scope ?? "character");
  const [formula, setFormula] = useState(
    mode.kind === "edit"
      ? ((mode.scope === "character" ? character.presets : presets)[mode.name] ?? "")
      : mode.formula,
  );
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const named = validatePresetName(name.trim());
  const nameError = name.trim() === "" ? null : "error" in named ? named.error.reason : null;
  const formulaProblem = formula.trim() === "" ? null : checkFormula(formula.trim());
  const caret = formulaProblem
    ? caretLines(formulaProblem.source, spanOf(formulaProblem.error))
    : null;
  const stored = "name" in named ? named.name : null;
  const target = scope === "character" ? character.presets : presets;
  const sameSlot = from !== null && from.scope === scope && from.name === stored;
  const replaces = stored !== null && !sameSlot && Object.hasOwn(target, stored);
  const shadows =
    stored !== null && scope === "character" && !replaces && Object.hasOwn(presets, stored);
  const ready = stored !== null && formula.trim() !== "" && formulaProblem === null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      await onSave(stored, formula.trim(), scope, from);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (from === null) return;
    setSaving(true);
    try {
      await onDelete(from);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogBackdrop className="fixed inset-0 bg-black/50" />
      <DialogContent className={OVERLAY}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <DialogTitle className="m-0 text-lg font-semibold">
              {editing === null ? "New preset" : `Edit ${editing}`}
            </DialogTitle>
            <DialogDescription className="m-0 text-sm text-ink-muted">
              Rolls the same formula every time you click it. Variables are read when it rolls.
            </DialogDescription>
          </div>

          <Field
            name="name"
            invalid={nameError === null ? undefined : true}
            className="flex flex-col gap-1"
          >
            <FieldLabel className="text-sm text-ink-body">Name</FieldLabel>
            <Input
              value={name}
              onValueChange={setName}
              placeholder="attack"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={editing === null}
              className={FIELD}
            />
            {nameError !== null && (
              <FieldError match className="text-sm text-danger">
                {nameError}
              </FieldError>
            )}
            {replaces && (
              <span className="text-sm text-ink-muted">
                A preset named '{stored}' already exists here. Saving replaces it.
              </span>
            )}
            {shadows && (
              <span className="text-sm text-ink-muted">
                This character's '{stored}' will be rolled instead of the global one.
              </span>
            )}
          </Field>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-sm text-ink-body">Scope</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="scope"
                value="character"
                checked={scope === "character"}
                onChange={() => setScope("character")}
              />
              Only {character.name}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="scope"
                value="global"
                checked={scope === "global"}
                onChange={() => setScope("global")}
              />
              Every character
            </label>
          </fieldset>

          <Field
            name="formula"
            invalid={formulaProblem === null ? undefined : true}
            className="flex flex-col gap-1"
          >
            <FieldLabel className="text-sm text-ink-body">Formula</FieldLabel>
            <Input
              value={formula}
              onValueChange={setFormula}
              placeholder="d20+5"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={editing !== null}
              className={FIELD}
            />
            {formulaProblem !== null && (
              <FieldError match className="text-sm text-danger">
                {`error: ${formulaProblem.message}`}
              </FieldError>
            )}
            {caret && (
              <span
                aria-hidden="true"
                className="block overflow-x-auto whitespace-pre font-mono text-sm text-ink-body"
              >
                {caret[0]}
                {"\n"}
                <span className="text-danger">{caret[1]}</span>
              </span>
            )}
          </Field>

          {confirming && editing !== null ? (
            <div
              role="group"
              aria-label="Confirm delete"
              className="flex items-center gap-3 text-sm"
            >
              <span>Delete {editing}?</span>
              <Button type="button" onClick={remove} disabled={saving} className={CONFIRM_YES}>
                Yes, delete
              </Button>
              <Button type="button" onClick={() => setConfirming(false)} className={CONFIRM_NO}>
                Keep it
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {editing !== null && (
                <Button type="button" onClick={() => setConfirming(true)} className={SECONDARY}>
                  Delete
                </Button>
              )}
              <span className="flex-1" />
              <DialogClose className={SECONDARY}>Cancel</DialogClose>
              <Button type="submit" disabled={!ready || saving} className={PRIMARY}>
                {replaces ? "Replace" : "Save"}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
