import type { Roll, RollReport } from "@rollin/engine";
import { breakdown } from "./breakdown";
import { caretLines } from "./caret";
import { hintText } from "./hints";

export interface Entry {
  /** What the player typed. */
  input: string;
  report: RollReport;
}

function RollRow({ roll }: { roll: Roll }) {
  const cells = breakdown(roll);
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line py-3 first:border-t-0">
      <span className="font-mono text-sm text-text-2">{roll.formula}</span>
      <span className="font-mono text-sm text-text">
        {cells.map((cell, i) =>
          cell.type === "text" ? (
            // The cells are a fixed, ordered rendering of one roll, so the index is the identity.
            <span key={i}>{cell.text}</span>
          ) : (
            <span
              key={i}
              className={`rounded-sm border border-line-strong bg-sunken px-1.5 py-0.5 ${
                cell.dropped ? "text-muted line-through" : ""
              }`}
            >
              {cell.face}
              {cell.dropped && <span className="sr-only"> dropped</span>}
            </span>
          ),
        )}
      </span>
      <span className="ml-auto font-mono text-3xl font-semibold text-text">
        <span className="sr-only">total </span>
        {roll.total}
      </span>
    </li>
  );
}

export function Result({ entry }: { entry: Entry }) {
  const { report } = entry;
  return (
    <article className="rounded-md border border-line bg-surface px-4 py-3">
      <p className="font-mono text-sm text-muted">
        <span aria-hidden="true">› </span>
        {entry.input}
      </p>
      {"ok" in report ? (
        <ul className="mt-2 list-none p-0">
          {report.ok.rolls.map((roll, i) => (
            <RollRow key={i} roll={roll} />
          ))}
        </ul>
      ) : (
        <ErrorBody error={report.error} />
      )}
    </article>
  );
}

function ErrorBody({ error }: { error: Extract<RollReport, { error: unknown }>["error"] }) {
  const caret = error.kind === "formula" ? caretLines(error.source, error.error.span) : null;
  return (
    <div className="mt-2 space-y-2">
      <p className="font-mono text-sm text-danger">error: {error.message}</p>
      {caret && (
        <pre className="m-0 overflow-x-auto font-mono text-sm text-text-2">
          {caret[0]}
          {"\n"}
          <span className="text-danger">{caret[1]}</span>
        </pre>
      )}
      {error.hints.map((hint) => (
        <p key={hintText(hint)} className="font-mono text-sm text-text-2">
          {hintText(hint)}
        </p>
      ))}
    </div>
  );
}
