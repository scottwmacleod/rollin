import { roll } from "@rollin/engine";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { dieSource } from "./dice";
import { useUpdate } from "./pwa";
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
  const storage = useRef<Storage | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const update = useUpdate();

  // Open storage, load the saved log, and follow other tabs. Rolls made before
  // the load finishes are kept after the saved ones.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    void openStorage().then(async ({ storage: opened, kept: ok }) => {
      const saved = await loadLog(opened).catch(() => []);
      if (cancelled) return;
      storage.current = opened;
      setKept(ok);
      setEntries((current) => {
        const first = nextEntryId(saved);
        const merged = capLog([...saved, ...current.map((e, i) => ({ ...e, id: first + i }))]);
        if (current.length > 0) void saveLog(opened, merged).catch(() => setKept(false));
        return merged;
      });
      unsubscribe = opened.subscribe<Entry[]>(ROLL_LOG_KEY, (value) =>
        setEntries(Array.isArray(value) ? capLog(value) : []),
      );
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  function clearLog() {
    setConfirming(false);
    setEntries([]);
    void storage.current?.delete(ROLL_LOG_KEY).catch(() => setKept(false));
    input.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = formula.trim();
    if (text === "") return;
    const report = roll(text, dieSource());
    const next = capLog([...entries, { id: nextEntryId(entries), input: text, report }]);
    setEntries(next);
    if (storage.current) void saveLog(storage.current, next).catch(() => setKept(false));
    setAnnouncement(
      "ok" in report
        ? `Rolled ${text}: ${report.ok.rolls.map((r) => `total ${r.total}`).join(", ")}`
        : `Error: ${report.error.message}`,
    );
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <picture>
        <source srcSet="/rollin-wordmark-light.svg" media="(prefers-color-scheme: light)" />
        <img src="/rollin-wordmark-dark.svg" alt="" width={162} height={51} />
      </picture>
      <h1 className="sr-only">rollin</h1>

      {update.available && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
        >
          <span>A new version of rollin is ready.</span>
          <Button
            type="button"
            onClick={update.reload}
            className="h-8 rounded-md bg-signal px-3 font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            Reload to update
          </Button>
        </div>
      )}

      <RollLog entries={entries} treeRef={log} onEscape={() => input.current?.focus()} />

      {!kept && (
        <p className="m-0 text-sm text-muted">
          Your browser is blocking storage, so the roll log won't be kept when you close or reload
          this page.
        </p>
      )}

      {entries.length > 0 &&
        (confirming ? (
          <div role="group" aria-label="Confirm clear" className="flex items-center gap-3 text-sm">
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
      </form>
    </main>
  );
}
