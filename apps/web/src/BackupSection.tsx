import { useEffect, useRef, useState } from "react";
import {
  type AddResult,
  answerClash,
  type Backup,
  buildBackup,
  type Choice,
  type Choices,
  type Clash,
  describeAdd,
  describePartialSummary,
  describeSkipped,
  describeSummary,
  downloadBackup,
  firstUndecided,
  type Incoming,
  incomingOf,
  listClashes,
  type ParsedFile,
  parseBackup,
  plural,
  type Saved,
  summarise,
} from "./backup";
import { type Character, loadRoster } from "./characters";
import { loadPresets, type PresetMap } from "./presets";
import type { Storage } from "./storage";
import { Button } from "./ui";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const secondary = `h-8 max-md:h-11 rounded-md border border-control-line px-3 text-sm text-ink-body ${focusRing}`;
const primary = `h-8 max-md:h-11 rounded-md bg-signal px-3 text-sm font-medium text-on-signal hover:opacity-90 ${focusRing}`;

/** Where Add has got to: the clashes to ask about, what has been chosen so far, and which one is showing. */
interface Asking {
  incoming: Incoming;
  saved: Saved;
  clashes: Clash[];
  choices: Choices;
  at: number;
}

/** How a clashing item reads in the prompt: a preset's formula, or a character's counts. */
const describeContent = (clash: Clash, characters: Character[], globalPresets: PresetMap) => {
  if (clash.kind === "preset") return globalPresets[clash.name] ?? "";
  const c = characters.find((x) => x.name === clash.name);
  if (!c) return "";
  const vars = Object.keys(c.vars).length;
  const presets = Object.keys(c.presets).length;
  return `${plural(vars, "variable")}, ${plural(presets, "preset")}`;
};

/** Export everything to a file, or replace or add to your data from one. Lives in the settings dialog. */
export function BackupSection({
  storage,
  onExported,
  onImported,
  onAdded,
}: {
  storage: () => Storage | null;
  onExported: (backup: Backup) => void;
  onImported: (backup: Backup) => Promise<void>;
  onAdded: (incoming: Incoming, choices: Choices) => Promise<AddResult>;
}) {
  const [includeLog, setIncludeLog] = useState(false);
  const [pending, setPending] = useState<ParsedFile | null>(null);
  const [message, setMessage] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [sameForAll, setSameForAll] = useState(false);
  const prompt = useRef<HTMLDivElement>(null);
  // A second tap while an add is being saved would run it twice.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const hold = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  };
  const promptAt = asking?.at;

  // Focus goes back to the import button once it is enabled again, which is after the render that closes the prompt.
  const refocus = useRef(false);
  useEffect(() => {
    if (refocus.current && asking === null) {
      refocus.current = false;
      importButton.current?.focus();
    }
  });

  // Each new question puts focus on its first choice.
  useEffect(() => {
    if (promptAt !== undefined) prompt.current?.querySelector("button")?.focus();
  }, [promptAt]);

  async function exportFile() {
    const current = storage();
    if (!current)
      return setMessage("Your browser is blocking storage, so there is nothing to export.");
    try {
      const backup = await buildBackup(current, { rollLog: includeLog });
      downloadBackup(backup);
      onExported(backup);
      setMessage("Backup downloaded.");
    } catch {
      setMessage("Couldn't read your data to export it.");
    }
  }

  async function choose(file: File | undefined) {
    setPending(null);
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (parsed.ok) {
      setPending(parsed.backup);
      setMessage(
        parsed.backup.kind === "partial"
          ? "That's a partial file. You can add it to your data."
          : "",
      );
    } else setMessage(parsed.error);
    if (picker.current) picker.current.value = "";
  }

  async function replace() {
    if (pending?.kind !== "full") return;
    try {
      await onImported(pending);
      setMessage("Imported. Your data now matches the backup.");
    } catch {
      setMessage("Couldn't save the imported data. Nothing was changed.");
    }
    setPending(null);
  }

  async function finishAdd(incoming: Incoming, choices: Choices) {
    hold(true);
    try {
      const result = await onAdded(incoming, choices);
      setMessage(describeAdd(result.counts));
    } catch {
      setMessage(
        "Couldn't save all of that. Some of it may have been added, so check your characters and presets.",
      );
    }
    hold(false);
    refocus.current = true;
    setAsking(null);
    setPending(null);
  }

  async function startAdd() {
    if (!pending || busyRef.current) return;
    const current = storage();
    if (!current) return setMessage("Your browser is blocking storage, so nothing can be added.");
    hold(true);
    const incoming = incomingOf(pending);
    let saved: Saved;
    try {
      saved = { roster: await loadRoster(current), globalPresets: await loadPresets(current) };
    } catch {
      hold(false);
      return setMessage("Couldn't read your data to add to it. Nothing was changed.");
    }
    const clashes = listClashes(saved, incoming);
    const choices: Choices = { characters: {}, presets: {} };
    if (clashes.length === 0) return void finishAdd(incoming, choices);
    hold(false);
    setSameForAll(false);
    setMessage("");
    setAsking({ incoming, saved, clashes, choices, at: 0 });
  }

  function answer(choice: Choice) {
    if (!asking || busyRef.current) return;
    const clash = asking.clashes[asking.at] as Clash;
    const choices = answerClash(asking.clashes, asking.choices, clash, choice, sameForAll);
    const next = firstUndecided(asking.clashes, choices);
    setSameForAll(false);
    if (next === -1) return void finishAdd(asking.incoming, choices);
    setAsking({ ...asking, choices, at: next });
  }

  function cancelAdd() {
    if (busyRef.current) return;
    setAsking(null);
    setPending(null);
    setMessage("Cancelled. Nothing was changed.");
    refocus.current = true;
  }

  const clash = asking?.clashes[asking.at];
  const remaining =
    asking && clash
      ? asking.clashes.filter(
          (c) =>
            c.kind === clash.kind &&
            !Object.hasOwn(
              c.kind === "character" ? asking.choices.characters : asking.choices.presets,
              c.name,
            ),
        ).length
      : 0;

  return (
    <section className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="m-0 text-sm font-medium text-ink-body">Your data</h3>
      <p className="m-0 text-sm text-ink-muted">
        Characters, variables, presets and settings. Browsers can clear their storage, so keep a
        backup file.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeLog}
          onChange={(e) => setIncludeLog(e.target.checked)}
          className="accent-signal"
        />
        Include the roll log
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void exportFile()} className={secondary}>
          Export backup
        </Button>
        <Button
          ref={importButton}
          type="button"
          onClick={() => picker.current?.click()}
          disabled={asking !== null}
          className={`${secondary} disabled:opacity-50`}
        >
          Import backup…
        </Button>
        <input
          ref={picker}
          type="file"
          accept=".json,application/json"
          aria-label="Backup file"
          hidden
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </div>
      {!asking && pending?.kind === "full" && (
        <div role="group" aria-label="Confirm import" className="flex flex-col gap-2 text-sm">
          <p className="m-0">
            This backup holds {describeSummary(summarise(pending.data))}.
            {describeSkipped(pending.skipped ?? 0)} Replace my data swaps out your characters,
            presets and settings
            {pending.data.rollLog !== undefined ? " and your roll log" : ""}. Add to my data brings
            in only its characters and global presets.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void startAdd()}
              disabled={busy}
              className={primary}
            >
              Add to my data
            </Button>
            <Button
              type="button"
              onClick={() => void replace()}
              disabled={busy}
              className={secondary}
            >
              Replace my data
            </Button>
            <Button type="button" onClick={() => setPending(null)} className={secondary}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!asking && pending?.kind === "partial" && (
        <div role="group" aria-label="Partial file" className="flex flex-col gap-2 text-sm">
          <p className="m-0">
            This is a partial file. It holds {describePartialSummary(pending.data)}.
          </p>
          <p className="m-0 text-ink-muted">
            Add to my data brings them in and leaves everything else as it is. Replace needs a full
            backup, because a partial file can't replace everything you have.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void startAdd()}
              disabled={busy}
              className={primary}
            >
              Add to my data
            </Button>
            <Button
              type="button"
              onClick={() => {
                setPending(null);
                setMessage("");
                importButton.current?.focus();
              }}
              className={secondary}
            >
              Close
            </Button>
          </div>
        </div>
      )}
      {asking && clash && (
        <div
          ref={prompt}
          role="group"
          aria-labelledby="add-clash-label"
          className="flex flex-col gap-2 text-sm"
        >
          <p id="add-clash-label" className="m-0">
            You already have {clash.kind === "character" ? "a character" : "a global preset"} called{" "}
            <strong>{clash.name}</strong>.
          </p>
          <p className="m-0 text-ink-muted">
            Yours:{" "}
            {describeContent(clash, asking.saved.roster.characters, asking.saved.globalPresets)}.
            The file's:{" "}
            {describeContent(clash, asking.incoming.characters, asking.incoming.globalPresets)}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => answer("keep-mine")}
              disabled={busy}
              className={secondary}
            >
              Keep mine
            </Button>
            <Button
              type="button"
              onClick={() => answer("take-theirs")}
              disabled={busy}
              className={secondary}
            >
              Take the file's
            </Button>
            <Button
              type="button"
              onClick={() => answer("keep-both")}
              disabled={busy}
              className={secondary}
            >
              Keep both
            </Button>
          </div>
          {remaining > 1 && (
            <label className="flex items-center gap-2 max-md:min-h-11">
              <input
                type="checkbox"
                checked={sameForAll}
                onChange={(e) => setSameForAll(e.target.checked)}
                className="accent-signal"
              />
              Do the same for the other {remaining - 1}{" "}
              {clash.kind === "character"
                ? remaining - 1 === 1
                  ? "character"
                  : "characters"
                : remaining - 1 === 1
                  ? "global preset"
                  : "global presets"}
            </label>
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={cancelAdd} disabled={busy} className={secondary}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <p role="status" className="m-0 min-h-5 text-sm text-ink-body">
        {message}
      </p>
    </section>
  );
}
