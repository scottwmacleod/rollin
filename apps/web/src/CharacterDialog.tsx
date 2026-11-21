import { type GameSystem, validateCharacterName } from "@rollin/engine";
import { type FormEvent, useState } from "react";
import { buildPartial, characterFilename, downloadBackup } from "./backup";
import { GAME_SYSTEMS, isCritRange, type Roster, type Rules } from "./characters";
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

export type CharacterDialogMode = { kind: "new" } | { kind: "edit"; name: string };

export function CharacterDialog({
  mode,
  roster,
  onSave,
  onDelete,
  onClose,
}: {
  mode: CharacterDialogMode;
  roster: Roster;
  onSave: (name: string, from: string | null, rules: Rules) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.name : null;
  const [name, setName] = useState(editing ?? "");
  const existing = editing === null ? undefined : roster.characters.find((c) => c.name === editing);
  const [system, setSystem] = useState<GameSystem | "">(existing?.system ?? "");
  const [critText, setCritText] = useState(existing?.critRange ? String(existing.critRange) : "");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

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
  const crit = critText.trim() === "" ? 20 : Number(critText);
  const critProblem =
    system !== "" && !isCritRange(crit) ? "crit range is a whole number from 2 to 20" : null;
  const rules: Rules = {
    ...(system === "" ? {} : { system }),
    ...(system !== "" && crit < 20 ? { critRange: crit } : {}),
  };
  const rulesChanged = rules.system !== existing?.system || rules.critRange !== existing?.critRange;
  const nameOk = stored !== null && !taken;
  const ready = nameOk && critProblem === null && (stored !== editing || rulesChanged);
  const canDelete = editing !== null && roster.characters.length > 1;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      await onSave(stored, editing, rules);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function exportCharacter() {
    if (existing === undefined) return;
    downloadBackup(buildPartial({ characters: [existing] }), characterFilename(existing.name));
    setExported(`Exported ${existing.name}.`);
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
    <Dialog open closeOnOutsidePress={false} onOpenChange={(open) => !open && onClose()}>
      <DialogBackdrop className="fixed inset-0 bg-ground/60" />
      <DialogContent className={OVERLAY}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <DialogTitle className="m-0 text-lg font-semibold">
              {editing === null ? "New character" : `Edit ${editing}`}
            </DialogTitle>
            <DialogDescription className="m-0 text-sm text-ink-muted">
              {editing === null
                ? "A character keeps its own variables and presets. Creating one switches to it."
                : "Rename this character, export it to a file, or delete it with its variables and presets."}
            </DialogDescription>
          </div>

          <Field
            name="name"
            invalid={problem === null ? undefined : true}
            className="flex flex-col gap-1"
          >
            <FieldLabel className="text-sm text-ink-body">Name</FieldLabel>
            <Input
              value={name}
              onValueChange={(v) => {
                setName(v);
                setExported(null);
              }}
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

          <div className="flex flex-col gap-1">
            <label htmlFor="game-system" className="text-sm text-ink-body">
              Game system
            </label>
            <select
              id="game-system"
              value={system}
              onChange={(e) => {
                setSystem(e.target.value as GameSystem | "");
                setExported(null);
              }}
              className={FIELD}
            >
              <option value="">None</option>
              {GAME_SYSTEMS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            <span className="text-sm text-ink-muted">
              Under D&amp;D 5e a natural 20 on an attack (a d20 roll with damage after it) is a
              critical hit and doubles the damage dice. Skill checks and saves never crit.
            </span>
          </div>

          {system !== "" && (
            <Field
              name="critRange"
              invalid={critProblem === null ? undefined : true}
              className="flex flex-col gap-1"
            >
              <FieldLabel className="text-sm text-ink-body">Crit range</FieldLabel>
              <Input
                value={critText}
                onValueChange={(v) => {
                  setCritText(v);
                  setExported(null);
                }}
                placeholder="20"
                inputMode="numeric"
                autoComplete="off"
                className={FIELD}
              />
              <span className="text-sm text-ink-muted">
                The lowest d20 that is a critical hit; 19 means 19 to 20. Leave empty for 20.
              </span>
              {critProblem !== null && (
                <FieldError match className="text-sm text-danger">
                  {critProblem}
                </FieldError>
              )}
            </Field>
          )}

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
              {existing !== undefined && (
                <Button
                  type="button"
                  onClick={exportCharacter}
                  disabled={saving}
                  className={`${SECONDARY} max-md:h-11`}
                >
                  Export
                </Button>
              )}
              <span className="flex-1" />
              <DialogClose className={SECONDARY}>Cancel</DialogClose>
              <Button type="submit" disabled={!ready || saving} className={PRIMARY}>
                {editing === null ? "Create" : "Save"}
              </Button>
            </div>
          )}

          {existing !== undefined && !confirming && (
            <div className="flex flex-col gap-1 text-sm text-ink-muted">
              <span>
                Export downloads this character as saved, without any unsaved changes here. Add the
                file from Settings on another device.
              </span>
              <span role="status" className="min-h-5 text-ink-body">
                {exported}
              </span>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
