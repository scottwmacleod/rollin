import { MAX_INT, validateVariableName } from "@rollin/engine";
import { type FormEvent, useState } from "react";

import type { Character } from "./characters";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  FieldError,
  FieldInput,
  FieldLabel,
} from "./ui";

export type VariableDialogMode = { kind: "new" } | { kind: "edit"; name: string };

export function parseValue(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[-+]?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && Math.abs(n) <= MAX_INT ? (n === 0 ? 0 : n) : null;
}

export function VariableDialog({
  mode,
  character,
  onSave,
  onDelete,
  onClose,
}: {
  mode: VariableDialogMode;
  character: Character;
  onSave: (name: string, value: number, from: string | null) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.name : null;
  const [name, setName] = useState(editing ?? "");
  const [value, setValue] = useState(editing === null ? "" : String(character.vars[editing] ?? ""));
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const typed = name.trim().replace(/^@/, "");
  const stored = validateVariableName(typed);
  const nameProblem =
    typed === ""
      ? null
      : stored === null
        ? "names start with a letter and use only letters, digits or '_'"
        : null;
  const replaces = stored !== null && stored !== editing && stored in character.vars;
  const parsed = parseValue(value);
  const valueProblem = value.trim() === "" || parsed !== null ? null : "must be a whole number";
  const ready = stored !== null && parsed !== null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (stored === null || parsed === null || saving) return;
    setSaving(true);
    try {
      await onSave(stored, parsed, editing);
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
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <DialogTitle>{editing === null ? "New variable" : `Edit @${editing}`}</DialogTitle>
            <DialogDescription>
              A whole number on {character.name}. Use it in a formula as @name, as in d20+@str.
            </DialogDescription>
          </div>

          <Field
            name="name"
            invalid={nameProblem === null ? undefined : true}
            className="flex flex-col gap-1"
          >
            <FieldLabel>Name</FieldLabel>
            <FieldInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="str"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={editing === null}
            />
            {nameProblem !== null && <FieldError match>{nameProblem}</FieldError>}
            {replaces && (
              <span className="text-sm text-muted-foreground">
                @{stored} is already set on {character.name}. Saving replaces it.
              </span>
            )}
          </Field>

          <Field
            name="value"
            invalid={valueProblem === null ? undefined : true}
            className="flex flex-col gap-1"
          >
            <FieldLabel>Value</FieldLabel>
            <FieldInput
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="3"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              autoFocus={editing !== null}
            />
            {valueProblem !== null && <FieldError match>{valueProblem}</FieldError>}
          </Field>

          {confirming && editing !== null ? (
            <div
              role="group"
              aria-label="Confirm delete"
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <span>Remove @{editing}?</span>
              <Button
                type="button"
                onClick={remove}
                disabled={saving}
                variant="destructive"
                size="sm"
              >
                Yes, remove
              </Button>
              <Button
                type="button"
                onClick={() => setConfirming(false)}
                variant="outline"
                size="sm"
              >
                Keep it
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {editing !== null && (
                <Button type="button" onClick={() => setConfirming(true)} variant="outline">
                  Remove
                </Button>
              )}
              <span className="flex-1" />
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!ready || saving}>
                {replaces ? "Replace" : "Save"}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
