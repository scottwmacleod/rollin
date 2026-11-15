import { checkFormula, validatePresetName } from "@rollin/engine";
import { type FormEvent, useState } from "react";
import { caretLines } from "./caret";
import type { PresetMap } from "./presets";
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
export type PresetDialogMode = { kind: "new"; formula: string } | { kind: "edit"; name: string };

const FIELD =
  "h-10 w-full rounded-md border border-line-strong bg-surface px-3 font-mono text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text aria-invalid:border-danger";
const SECONDARY =
  "h-10 rounded-md border border-line-strong px-4 text-sm text-text-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

/**
 * The edit-preset dialog (#86, option A): name, formula with a live check,
 * Delete, Cancel and Save. The same dialog makes a new preset. The button says
 * Replace when the name is already taken by another preset. A rename saves the
 * new name and removes the old one.
 */
export function PresetDialog({
  mode,
  presets,
  onSave,
  onDelete,
  onClose,
}: {
  mode: PresetDialogMode;
  presets: PresetMap;
  /** `from` is the name being edited, if any. Resolves when the save has been stored. */
  onSave: (name: string, formula: string, from: string | null) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.name : null;
  const [name, setName] = useState(editing ?? "");
  const [formula, setFormula] = useState(
    mode.kind === "edit" ? (presets[mode.name] ?? "") : mode.formula,
  );
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const named = validatePresetName(name.trim());
  const nameError = name.trim() === "" ? null : "error" in named ? named.error.reason : null;
  const formulaProblem = formula.trim() === "" ? null : checkFormula(formula.trim());
  const caret = formulaProblem
    ? caretLines(formulaProblem.source, formulaProblem.error.span)
    : null;
  const stored = "name" in named ? named.name : null;
  const replaces = stored !== null && stored !== editing && stored in presets;
  const ready = stored !== null && formula.trim() !== "" && formulaProblem === null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      await onSave(stored, formula.trim(), editing);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (editing === null) return;
    setSaving(true);
    try {
      await onDelete(editing);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogBackdrop className="fixed inset-0 bg-black/50" />
      <DialogContent className="fixed top-1/2 left-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 text-text shadow-lg">
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <DialogTitle className="m-0 text-lg font-semibold">
              {editing === null ? "New preset" : `Edit ${editing}`}
            </DialogTitle>
            <DialogDescription className="m-0 text-sm text-muted">
              A global preset: it rolls the same formula every time you click it.
            </DialogDescription>
          </div>

          <Field
            name="name"
            invalid={nameError === null ? undefined : true}
            className="flex flex-col gap-1"
          >
            <FieldLabel className="text-sm text-text-2">Name</FieldLabel>
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
              <span className="text-sm text-muted">
                A preset named '{stored}' already exists. Saving replaces it.
              </span>
            )}
          </Field>

          <Field
            name="formula"
            invalid={formulaProblem === null ? undefined : true}
            className="flex flex-col gap-1"
          >
            <FieldLabel className="text-sm text-text-2">Formula</FieldLabel>
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
                className="block overflow-x-auto whitespace-pre font-mono text-sm text-text-2"
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
              <Button
                type="button"
                onClick={remove}
                disabled={saving}
                className="h-8 rounded-md bg-signal px-3 font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
              >
                Yes, delete
              </Button>
              <Button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-8 rounded-md border border-line-strong px-3 text-text-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
              >
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
              <Button
                type="submit"
                disabled={!ready || saving}
                className="inline-flex h-10 items-center justify-center rounded-md bg-signal px-5 text-sm font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50"
              >
                {replaces ? "Replace" : "Save"}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
