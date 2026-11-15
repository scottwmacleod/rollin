import { roll } from "@rollin/engine";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { dieSource } from "./dice";
import { PresetDialog, type PresetDialogMode } from "./PresetDialog";
import { PresetSidebar } from "./PresetSidebar";
import { cleanPresets, loadPresets, PRESETS_KEY, type PresetMap, updatePresets } from "./presets";
import { type Entry } from "./Result";
import { RollLog } from "./RollLog";
import { capLog, loadLog, nextEntryId, ROLL_LOG_KEY, saveLog } from "./rollLog";
import { openStorage, type Storage } from "./storage";
import { Button, Field, FieldLabel, Input } from "./ui";

export function App() {
  const [formula, setFormula] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [kept, setKept] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [presets, setPresets] = useState<PresetMap | null>(null);
  const [dialog, setDialog] = useState<PresetDialogMode | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const storage = useRef<Storage | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  // Open storage, load the saved log, and follow other tabs. Rolls made before
  // the load finishes are kept after the saved ones.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    void openStorage().then(async ({ storage: opened, kept: ok }) => {
      const saved = await loadLog(opened).catch(() => []);
      const savedPresets = await loadPresets(opened).catch(() => ({}));
      if (cancelled) return;
      storage.current = opened;
      setKept(ok);
      setPresets((current) => ({ ...savedPresets, ...current }));
      setEntries((current) => {
        const first = nextEntryId(saved);
        const merged = capLog([...saved, ...current.map((e, i) => ({ ...e, id: first + i }))]);
        if (current.length > 0) void saveLog(opened, merged).catch(() => setKept(false));
        return merged;
      });
      const stopLog = opened.subscribe<Entry[]>(ROLL_LOG_KEY, (value) =>
        setEntries(Array.isArray(value) ? capLog(value) : []),
      );
      const stopPresets = opened.subscribe<PresetMap>(PRESETS_KEY, (value) =>
        setPresets(cleanPresets(value)),
      );
      unsubscribe = () => {
        stopLog();
        stopPresets();
      };
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  function openDialog(mode: PresetDialogMode) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(mode);
  }

  // When the dialog closes, focus goes back to what opened it, or to the formula box
  // if that is gone (a renamed or deleted preset's Edit button).
  useEffect(() => {
    if (dialog !== null) return;
    const back = opener.current;
    opener.current = null;
    if (back === null) return;
    (back.isConnected ? back : input.current)?.focus();
  }, [dialog]);

  function clearLog() {
    setConfirming(false);
    setEntries([]);
    void storage.current?.delete(ROLL_LOG_KEY).catch(() => setKept(false));
    input.current?.focus();
  }

  /** Rolls what was typed, or a preset's name, and puts the result in the log. */
  function rollLine(text: string) {
    const report = roll(text, dieSource(), { globalPresets: presets ?? {} });
    const next = capLog([...entries, { id: nextEntryId(entries), input: text, report }]);
    setEntries(next);
    if (storage.current) void saveLog(storage.current, next).catch(() => setKept(false));
    const preset = "ok" in report ? report.ok.preset : null;
    const what = preset === null ? text : `${preset[0]} (${preset[1]})`;
    setAnnouncement(
      "ok" in report
        ? `Rolled ${what}: ${report.ok.rolls.map((r) => `total ${r.total}`).join(", ")}`
        : `Error: ${report.error.message}`,
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = formula.trim();
    if (text !== "") rollLine(text);
  }

  /** Saves `name`, dropping `from` when the preset was renamed. Waits for the write. */
  async function savePreset(name: string, text: string, from: string | null) {
    const apply = (current: PresetMap): PresetMap => {
      const next = { ...current, [name]: text };
      if (from !== null && from !== name) delete next[from];
      return next;
    };
    await changePresets(apply);
  }

  async function removePreset(name: string) {
    await changePresets((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function changePresets(apply: (current: PresetMap) => PresetMap) {
    if (storage.current) {
      try {
        setPresets(await updatePresets(storage.current, apply));
        return;
      } catch {
        setKept(false);
      }
    }
    setPresets((current) => apply(current ?? {}));
  }

  /** Esc in the formula box moves to the newest log entry (the log is above it). */
  function focusLog(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
    const items = log.current?.querySelectorAll<HTMLElement>('[role="treeitem"]');
    if (!items || items.length === 0) return;
    event.preventDefault();
    const current = log.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
    (current ?? items[items.length - 1])?.focus();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-10">
      <picture>
        <source srcSet="/rollin-wordmark-light.svg" media="(prefers-color-scheme: light)" />
        <img src="/rollin-wordmark-dark.svg" alt="" width={162} height={51} />
      </picture>
      <h1 className="sr-only">rollin</h1>

      <div className="flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <PresetSidebar
          presets={presets}
          onRoll={rollLine}
          onNew={() => openDialog({ kind: "new", formula: formula.trim() })}
          onEdit={(name) => openDialog({ kind: "edit", name })}
        />
        <div className="flex min-w-0 flex-col gap-6">
          <RollLog entries={entries} treeRef={log} onEscape={() => input.current?.focus()} />

          {!kept && (
            <p className="m-0 text-sm text-muted">
              Your browser is blocking storage, so the roll log and your presets won't be kept when
              you close or reload this page.
            </p>
          )}

          {entries.length > 0 &&
            (confirming ? (
              <div
                role="group"
                aria-label="Confirm clear"
                className="flex items-center gap-3 text-sm"
              >
                <span>Clear the whole roll log?</span>
                <Button
                  type="button"
                  onClick={clearLog}
                  className="h-8 rounded-md bg-signal px-3 font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
                >
                  Yes, clear
                </Button>
                <Button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-8 rounded-md border border-line-strong px-3 text-text-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div>
                <Button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="h-8 rounded-md border border-line-strong px-3 text-sm text-text-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
                >
                  Clear
                </Button>
              </div>
            ))}

          <div role="status" className="sr-only">
            {announcement}
          </div>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="sticky bottom-0 flex flex-col gap-3 bg-bg py-3 sm:flex-row sm:items-end"
      >
        <Field name="formula" className="flex flex-1 flex-col gap-1">
          <FieldLabel className="text-sm text-text-2">Formula</FieldLabel>
          <Input
            value={formula}
            onValueChange={setFormula}
            placeholder="2d6+3"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            ref={input}
            onKeyDown={focusLog}
            className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 font-mono text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          />
        </Field>
        <Button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-signal px-5 text-sm font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
        >
          Roll
        </Button>
        <Button
          type="button"
          disabled={presets === null}
          onClick={() => openDialog({ kind: "new", formula: formula.trim() })}
          className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong px-4 text-sm text-text-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50"
        >
          Save as preset
        </Button>
      </form>

      {dialog !== null && presets !== null && (
        <PresetDialog
          mode={dialog}
          presets={presets}
          onSave={savePreset}
          onDelete={removePreset}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}
