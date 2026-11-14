import { roll } from "@rollin/engine";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { dieSource } from "./dice";
import { type Entry } from "./Result";
import { RollLog } from "./RollLog";
import { Button, Field, FieldLabel, Input } from "./ui";

export function App() {
  const [formula, setFormula] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const nextId = useRef(1);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = formula.trim();
    if (text === "") return;
    const report = roll(text, dieSource());
    setEntries((all) => [...all, { id: nextId.current++, input: text, report }]);
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

      <RollLog entries={entries} treeRef={log} onEscape={() => input.current?.focus()} />

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
