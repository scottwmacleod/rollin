import { type Roll, type RollReport, spanOf } from "@rollin/engine";

import { breakdown, type Mark, type Shown } from "./breakdown";
import { caretLines } from "./caret";
import { hintText } from "./hints";

export interface Entry {
  id: number;
  input: string;
  report: RollReport;
}

export function spoken(roll: Roll): string {
  const parts = [`total ${roll.total}`];
  if (roll.crit === "hit") parts.push("critical hit");
  if (roll.crit === "miss") parts.push("critical miss");
  if (roll.doubled) parts.push("damage dice doubled");
  return parts.join(", ");
}

export function CritMarks({ roll }: { roll: Roll }) {
  if (roll.crit === undefined && !roll.doubled) return null;
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs font-medium">
      {roll.crit === "hit" && (
        <span className="rounded-sm border border-primary px-1.5 py-0.5 text-foreground">
          Critical hit
        </span>
      )}
      {roll.crit === "miss" && (
        <span className="rounded-sm border border-destructive px-1.5 py-0.5 text-destructive">
          Critical miss
        </span>
      )}
      {roll.doubled && (
        <span className="rounded-sm border border-border px-1.5 py-0.5 text-foreground">
          Dice doubled
        </span>
      )}
    </span>
  );
}

export function Outcome({ outcome }: { outcome?: "success" | "failure" }) {
  if (outcome === "success") return <span> ✓ success</span>;
  if (outcome === "failure") return <span> ✗ failure</span>;
  return null;
}

export function outcomeClass(outcome?: "success" | "failure"): string {
  return outcome === "success"
    ? "text-foreground"
    : outcome === "failure"
      ? "text-destructive"
      : "";
}

const CRIT_EDGE: Record<string, string> = {
  hit: "border-l-4 border-primary pl-2",
  miss: "border-l-4 border-destructive pl-2",
};

const MARKS: Record<Mark, string> = {
  dropped:
    "border-border bg-muted text-muted-foreground line-through opacity-60 after:sr-only after:content-['_dropped']",
  rerolled:
    "border-border bg-muted text-muted-foreground line-through opacity-60 after:sr-only after:content-['_rerolled']",
  exploded: "border-primary bg-accent after:sr-only after:content-['_exploded']",
};

function DieChip({ die }: { die: Shown }) {
  return (
    <span
      data-mark={die.mark}
      className={`rounded-sm border px-1.5 py-0.5 ${
        die.mark ? MARKS[die.mark] : `border-border bg-muted ${outcomeClass(die.outcome)}`
      }`}
    >
      {die.value}
      <Outcome outcome={die.outcome} />
    </span>
  );
}

export function RollLine({ roll, showFormula }: { roll: Roll; showFormula: boolean }) {
  const cells = breakdown(roll);
  return (
    <span
      data-crit={roll.crit}
      className={`flex flex-1 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 ${CRIT_EDGE[roll.crit ?? ""] ?? ""}`}
    >
      {showFormula && (
        <span className="font-mono text-sm text-foreground">
          {roll.iteration !== undefined && (
            <>
              <span className="mr-2 text-muted-foreground">repeat {roll.iteration}</span>{" "}
            </>
          )}
          {roll.formula}
          {roll.label !== undefined && (
            <>
              {" "}
              <span className="ml-2 text-muted-foreground"># {roll.label}</span>
            </>
          )}
        </span>
      )}
      <span className="flex min-w-result-cells grow basis-0 flex-wrap items-baseline gap-x-2 gap-y-1.5 font-mono text-sm text-foreground">
        {cells.map((cell, i) =>
          cell.type === "text" ? (
            <span key={i}>{cell.text} </span>
          ) : (
            <span key={i} data-term="" className="flex flex-wrap items-baseline gap-1">
              <span className="text-foreground">{cell.term} </span>
              {cell.dice.map((die, j) => (
                <span key={j}>
                  <DieChip die={die} />{" "}
                </span>
              ))}
            </span>
          ),
        )}
      </span>
      <CritMarks roll={roll} />
      <span className="ml-auto shrink-0 font-mono text-3xl font-semibold text-foreground">
        <span className="mr-2 font-sans text-xs font-normal text-muted-foreground">total</span>{" "}
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
      <span className="block font-mono text-sm text-destructive">error: {error.message}</span>
      {caret && (
        <span
          data-caret
          className="block overflow-x-auto whitespace-pre font-mono text-sm text-foreground"
        >
          {caret[0]}
          {"\n"}
          <span className="text-destructive">{caret[1]}</span>
        </span>
      )}
      {error.hints.map((hint) => (
        <span key={hintText(hint)} className="block font-mono text-sm text-foreground">
          {hintText(hint)}
        </span>
      ))}
    </span>
  );
}
