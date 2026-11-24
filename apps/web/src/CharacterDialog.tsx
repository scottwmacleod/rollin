import { type GameSystem, validateCharacterName } from "@rollin/engine";
import { type FormEvent, useState } from "react";

import { buildPartial, characterFilename, downloadBackup } from "./backup";
import { GAME_SYSTEMS, isCritRange, type Roster, type Rules } from "./characters";
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
  Label,
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <DialogTitle>{editing === null ? "New character" : `Edit ${editing}`}</DialogTitle>
            <DialogDescription>
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
            <FieldLabel>Name</FieldLabel>
            <FieldInput
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setExported(null);
              }}
              placeholder="aria"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
            {problem !== null && <FieldError match>{problem}</FieldError>}
          </Field>

          <div className="flex flex-col gap-1">
            <Label htmlFor="game-system">Game system</Label>
            <select
              id="game-system"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-11 dark:bg-input/30 dark:*:bg-popover"
              value={system}
              onChange={(e) => {
                setSystem(e.target.value as GameSystem | "");
                setExported(null);
              }}
            >
              <option value="">None</option>
              {GAME_SYSTEMS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            <span className="text-sm text-muted-foreground">
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
              <FieldLabel>Crit range</FieldLabel>
              <FieldInput
                value={critText}
                onChange={(e) => {
                  setCritText(e.target.value);
                  setExported(null);
                }}
                placeholder="20"
                inputMode="numeric"
                autoComplete="off"
              />
              <span className="text-sm text-muted-foreground">
                The lowest d20 that is a critical hit; 19 means 19 to 20. Leave empty for 20.
              </span>
              {critProblem !== null && <FieldError match>{critProblem}</FieldError>}
            </Field>
          )}

          {confirming && editing !== null ? (
            <div
              role="group"
              aria-label="Confirm delete"
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <span>Delete {editing}, with its variables and presets?</span>
              <Button
                type="button"
                onClick={remove}
                disabled={saving}
                variant="destructive"
                size="sm"
              >
                Yes, delete
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
              {canDelete && (
                <Button type="button" onClick={() => setConfirming(true)} variant="outline">
                  Delete
                </Button>
              )}
              {existing !== undefined && (
                <Button type="button" onClick={exportCharacter} disabled={saving} variant="outline">
                  Export
                </Button>
              )}
              <span className="flex-1" />
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!ready || saving}>
                {editing === null ? "Create" : "Save"}
              </Button>
            </div>
          )}

          {existing !== undefined && !confirming && (
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span>
                Export downloads this character as saved, without any unsaved changes here. Add the
                file from Settings on another device.
              </span>
              <span role="status" className="min-h-5 text-foreground">
                {exported}
              </span>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
