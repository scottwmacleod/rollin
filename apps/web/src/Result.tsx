import { type Roll, type RollReport, spanOf } from "@rollin/engine";
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

/** What a roll says out loud for the live region: its total, and any crit or doubling. */
export function spoken(roll: Roll): string {
  const parts = [`total ${roll.total}`];
  if (roll.crit === "hit") parts.push("critical hit");
  if (roll.crit === "miss") parts.push("critical miss");
  if (roll.doubled) parts.push("damage dice doubled");
  return parts.join(", ");
}

/** A critical hit or miss, and doubled damage dice, in visible text so colour is never the only cue. */
export function CritMarks({ roll }: { roll: Roll }) {
  if (roll.crit === undefined && !roll.doubled) return null;
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs font-medium">
      {roll.crit === "hit" && (
        <span className="rounded-sm border border-signal-ink px-1.5 py-0.5 text-signal-ink">
          Critical hit
        </span>
      )}
      {roll.crit === "miss" && (
        <span className="rounded-sm border border-danger px-1.5 py-0.5 text-danger">
          Critical miss
        </span>
      )}
      {roll.doubled && (
        <span className="rounded-sm border border-line-strong px-1.5 py-0.5 text-ink-body">
          Dice doubled
        </span>
      )}
    </span>
  );
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

/** A critical hit gets a lime edge and a critical miss a red one; the text label stays, so colour is never the only cue. */
const CRIT_EDGE: Record<string, string> = {
  hit: "border-l-4 border-signal pl-2",
  miss: "border-l-4 border-danger pl-2",
};

/** One roll in one line: its formula, the dice it landed on, and the total. */
export function RollLine({ roll, showFormula }: { roll: Roll; showFormula: boolean }) {
  const cells = breakdown(roll);
  return (
    <span
      data-crit={roll.crit}
      className={`flex flex-1 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 ${CRIT_EDGE[roll.crit ?? ""] ?? ""}`}
    >
      {showFormula && (
        <span className="font-mono text-sm text-ink-body">
          {roll.iteration !== undefined && (
            <>
              <span className="mr-2 text-ink-muted">repeat {roll.iteration}</span>{" "}
            </>
          )}
          {roll.formula}
          {roll.label !== undefined && (
            <>
              {" "}
              <span className="ml-2 text-ink-muted"># {roll.label}</span>
            </>
          )}
        </span>
      )}
      <span className="font-mono text-sm text-ink">
        {cells.map((cell, i) =>
          cell.type === "text" ? (
            // The cells are a fixed, ordered rendering of one roll, so the index is the identity.
            <span key={i}>{cell.text}</span>
          ) : (
            <span
              key={i}
              className={`rounded-sm border border-line-strong bg-surface-sunken px-1.5 py-0.5 ${
                cell.dropped
                  ? "text-ink-muted line-through opacity-60 after:sr-only after:content-['_dropped']"
                  : outcomeClass(cell.outcome)
              }`}
            >
              {cell.face}
              <Outcome outcome={cell.outcome} />
            </span>
          ),
        )}
      </span>
      <CritMarks roll={roll} />
      <span className="ml-auto font-mono text-3xl font-semibold text-ink">
        <span className="mr-2 font-sans text-xs font-normal text-ink-muted">total</span>{" "}
        {roll.total}
      </span>
    </span>
  );
}

export function ErrorBody({ error }: { error: Extract<RollReport, { error: unknown }>["error"] }) {
  const caret =
    error.kind === "formula" || error.kind === "undefined_variable"
      ? caretLines(error.source, spanOf(error.error))
      : null;
  return (
    <span className="mt-2 block space-y-2">
      <span className="block font-mono text-sm text-danger">error: {error.message}</span>
      {caret && (
        <span
          data-caret
          className="block overflow-x-auto whitespace-pre font-mono text-sm text-ink-body"
        >
          {caret[0]}
          {"\n"}
          <span className="text-danger">{caret[1]}</span>
        </span>
      )}
      {error.hints.map((hint) => (
        <span key={hintText(hint)} className="block font-mono text-sm text-ink-body">
          {hintText(hint)}
        </span>
      ))}
    </span>
  );
}
