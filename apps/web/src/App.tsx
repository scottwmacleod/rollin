import { roll } from "@rollin/engine";
import { type FormEvent, useState } from "react";
import { dieSource } from "./dice";
import { type Entry, Result } from "./Result";
import { Button, Field, FieldLabel, Input } from "./ui";

export function App() {
  const [formula, setFormula] = useState("");
  const [entry, setEntry] = useState<Entry | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = formula.trim();
    if (input === "") return;
    setEntry({ input, report: roll(input, dieSource()) });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <picture>
        <source srcSet="/rollin-wordmark-light.svg" media="(prefers-color-scheme: light)" />
        <img src="/rollin-wordmark-dark.svg" alt="" width={162} height={51} />
      </picture>
      <h1 className="sr-only">rollin</h1>

      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
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

      {/* Always in the page, so a screen reader announces what lands in it. */}
      <section aria-label="Result" aria-live="polite" aria-atomic="true">
        {entry && <Result entry={entry} />}
      </section>
    </main>
  );
}
