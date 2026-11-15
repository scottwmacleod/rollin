import { useRef, useState } from "react";
import {
  type Backup,
  buildBackup,
  describePartialSummary,
  describeSummary,
  downloadBackup,
  type ParsedBackup,
  parseBackup,
  summarise,
} from "./backup";
import type { Storage } from "./storage";
import { Button } from "./ui";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";
const secondary = `h-8 max-md:h-11 rounded-md border border-line-strong px-3 text-sm text-text-2 ${focusRing}`;
const primary = `h-8 max-md:h-11 rounded-md bg-signal px-3 text-sm font-medium text-on-signal hover:opacity-90 ${focusRing}`;

/** Export everything to a file, or replace everything from one. Lives in the settings dialog. */
export function BackupSection({
  storage,
  onExported,
  onImported,
}: {
  storage: () => Storage | null;
  onExported: (backup: Backup) => void;
  onImported: (backup: Backup) => Promise<void>;
}) {
  const [includeLog, setIncludeLog] = useState(false);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [message, setMessage] = useState("");
  const picker = useRef<HTMLInputElement>(null);

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
      setMessage("");
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

  return (
    <section className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="m-0 text-sm font-medium text-text-2">Your data</h3>
      <p className="m-0 text-sm text-muted">
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
        <Button type="button" onClick={() => picker.current?.click()} className={secondary}>
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
      {pending?.kind === "full" && (
        <div role="group" aria-label="Confirm import" className="flex flex-col gap-2 text-sm">
          <p className="m-0">
            This backup holds {describeSummary(summarise(pending.data))}. Replace my data swaps out
            your characters, presets and settings
            {pending.data.rollLog !== undefined ? " and your roll log" : ""}.
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void replace()} className={primary}>
              Replace my data
            </Button>
            <Button type="button" onClick={() => setPending(null)} className={secondary}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {pending?.kind === "partial" && (
        <div role="group" aria-label="Partial file" className="flex flex-col gap-2 text-sm">
          <p className="m-0">
            This is a partial file. It holds {describePartialSummary(pending.data)}.
          </p>
          <p className="m-0 text-muted">
            Replace needs a full backup, because a partial file can't replace everything you have.
            Nothing was changed.
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => setPending(null)} className={secondary}>
              Close
            </Button>
          </div>
        </div>
      )}
      <p role="status" className="m-0 min-h-5 text-sm text-text-2">
        {message}
      </p>
    </section>
  );
}
