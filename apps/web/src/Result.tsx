import type { Roll, RollReport } from "@rollin/engine";
import { breakdown } from "./breakdown";
import { caretLines } from "./caret";
import { hintText } from "./hints";

export interface Entry {
  /** Unique within the session; the roll log's identity for the entry. */
  id: number;
  /** What the player typed. */
  input: string;
  report: RollReport;
}

/** A success or failure mark, in visible text so the accessible name matches what is seen. */
export function Outcome({ outcome }: { outcome?: "success" | "failure" }) {
  if (outcome === "success") return <span> ✓ success</span>;
  if (outcome === "failure") return <span> ✗ failure</span>;
  return null;
}

export function outcomeClass(outcome?: "success" | "failure"): string {
  return outcome === "success" ? "text-signal-ink" : outcome === "failure" ? "text-danger" : "";
}

/** One roll in one line: its formula, the dice it landed on, and the total. */
export function RollLine({ roll, showFormula }: { roll: Roll; showFormula: boolean }) {
  const cells = breakdown(roll);
  return (
    <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      {showFormula && (
        <span className="font-mono text-sm text-text-2">
          {roll.iteration !== undefined && (
            <>
              <span className="mr-2 text-muted">repeat {roll.iteration}</span>{" "}
            </>
          )}
          {roll.formula}
          {roll.label !== undefined && (
            <>
              {" "}
              <span className="ml-2 text-muted"># {roll.label}</span>
            </>
          )}
        </span>
      )}
      <span className="font-mono text-sm text-text">
        {cells.map((cell, i) =>
          cell.type === "text" ? (
            // The cells are a fixed, ordered rendering of one roll, so the index is the identity.
            <span key={i}>{cell.text}</span>
          ) : (
            <span
              key={i}
              className={`rounded-sm border border-line-strong bg-sunken px-1.5 py-0.5 ${outcomeClass(cell.outcome)}`}
            >
              {cell.face}
              <Outcome outcome={cell.outcome} />
            </span>
          ),
        )}
      </span>
      <span className="ml-auto font-mono text-3xl font-semibold text-text">
        <span className="mr-2 font-sans text-xs font-normal text-muted">total</span> {roll.total}
      </span>
    </span>
  );
}

export function ErrorBody({ error }: { error: Extract<RollReport, { error: unknown }>["error"] }) {
  const caret = error.kind === "formula" ? caretLines(error.source, error.error.span) : null;
  return (
    <span className="mt-2 block space-y-2">
      <span className="block font-mono text-sm text-danger">error: {error.message}</span>
      {caret && (
        <span
          data-caret
          className="block overflow-x-auto whitespace-pre font-mono text-sm text-text-2"
        >
          {caret[0]}
          {"\n"}
          <span className="text-danger">{caret[1]}</span>
        </span>
      )}
      {error.hints.map((hint) => (
        <span key={hintText(hint)} className="block font-mono text-sm text-text-2">
          {hintText(hint)}
        </span>
      ))}
    </span>
  );
}
