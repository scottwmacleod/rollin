import { validateCharacterName } from "@rollin/engine";
import { type FormEvent, useState } from "react";
import type { Roster } from "./characters";
import { CONFIRM_NO, CONFIRM_YES, FIELD, OVERLAY, PRIMARY, SECONDARY } from "./dialogStyles";
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

/** What the dialog is doing: making a character, or renaming or deleting one. */
export type CharacterDialogMode = { kind: "new" } | { kind: "edit"; name: string };

/**
 * The new-character dialog (#86, option A): one name field with a live check,
 * and Create disabled until the name is valid. The same dialog renames a
 * character and, while another exists, deletes it.
 */
export function CharacterDialog({
  mode,
  roster,
  onSave,
  onDelete,
  onClose,
}: {
  mode: CharacterDialogMode;
  roster: Roster;
  /** `from` is the name being renamed, if any. Resolves when the change has been stored. */
  onSave: (name: string, from: string | null) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.name : null;
  const [name, setName] = useState(editing ?? "");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const checked = validateCharacterName(name.trim());
  const stored = "name" in checked ? checked.name : null;
  const taken =
    stored !== null && stored !== editing && roster.characters.some((c) => c.name === stored);
  const problem =
    name.trim() === ""
      ? null
      : "error" in checked
        ? checked.error.reason
        : taken
          ? `there is already a character named '${stored}'`
          : null;
  const ready = stored !== null && !taken && stored !== editing;
  const canDelete = editing !== null && roster.characters.length > 1;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      await onSave(stored, editing);
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
      <DialogContent className={OVERLAY}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <DialogTitle className="m-0 text-lg font-semibold">
              {editing === null ? "New character" : `Edit ${editing}`}
            </DialogTitle>
            <DialogDescription className="m-0 text-sm text-muted">
              {editing === null
                ? "A character keeps its own variables and presets. Creating one switches to it."
                : "Rename this character, or delete it with its variables and presets."}
            </DialogDescription>
          </div>

          <Field
            name="name"
            invalid={problem === null ? undefined : true}
            className="flex flex-col gap-1"
          >
            <FieldLabel className="text-sm text-text-2">Name</FieldLabel>
            <Input
              value={name}
              onValueChange={setName}
              placeholder="aria"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className={FIELD}
            />
            {problem !== null && (
              <FieldError match className="text-sm text-danger">
                {problem}
              </FieldError>
            )}
          </Field>

          {confirming && editing !== null ? (
            <div
              role="group"
              aria-label="Confirm delete"
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <span>Delete {editing}, with its variables and presets?</span>
              <Button type="button" onClick={remove} disabled={saving} className={CONFIRM_YES}>
                Yes, delete
              </Button>
              <Button type="button" onClick={() => setConfirming(false)} className={CONFIRM_NO}>
                Keep it
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {canDelete && (
                <Button type="button" onClick={() => setConfirming(true)} className={SECONDARY}>
                  Delete
                </Button>
              )}
              <span className="flex-1" />
              <DialogClose className={SECONDARY}>Cancel</DialogClose>
              <Button type="submit" disabled={!ready || saving} className={PRIMARY}>
                {editing === null ? "Create" : "Save"}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
