import type { Die, Roll } from "@rollin/engine";
import { type KeyboardEvent, type Ref, useEffect, useRef } from "react";
import { type Entry, ErrorBody, Outcome, outcomeClass, RollLine } from "./Result";
import { type Term, terms } from "./terms";
import { Tree, TreeGroup, TreeItem, TreeItemIndicator, TreeItemLabel } from "./ui";

/** How a die that was not kept reads, for the eye and for a screen reader. */
const MARKS: Record<string, { word: string; className: string }> = {
  dropped: { word: "dropped", className: "line-through opacity-60" },
  rerolled: { word: "rerolled", className: "line-through opacity-60" },
  exploded: { word: "exploded", className: "border-signal text-signal-ink" },
};

function DieChip({ die }: { die: Die }) {
  const mark = MARKS[die.status as string];
  return (
    <span
      data-status={die.status}
      className={`rounded-sm border border-line-strong bg-sunken px-1.5 py-0.5 font-mono text-sm ${mark?.className ?? ""} ${outcomeClass(die.outcome)}`}
    >
      {die.value}
      <Outcome outcome={die.outcome} />
      {mark && (
        <>
          {" "}
          <span className="font-sans text-xs">{mark.word}</span>
        </>
      )}
    </span>
  );
}

function TermLabel({ term }: { term: Term }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-mono text-sm text-text-2">{term.label}</span>{" "}
      <span className="flex flex-wrap gap-1">
        {term.dice.map((die, i) => (
          // A term's dice are a fixed, ordered list, so the index is the identity.
          <span key={i}>
            <DieChip die={die} />{" "}
          </span>
        ))}
      </span>{" "}
      <span className="font-mono text-sm text-text">
        <span className="mr-1 font-sans text-xs text-muted">subtotal</span> {term.subtotal}
      </span>
    </span>
  );
}

const ROW = "flex items-baseline gap-2 py-1 outline-none";
const FOCUS = "data-[highlighted]:outline-2 data-[highlighted]:outline-offset-2";

function TermItems({ prefix, list }: { prefix: string; list: Term[] }) {
  return list.map((term, i) => (
    <TreeItem key={i} value={`${prefix}/${i}`}>
      <TreeItemLabel className={`${ROW} ${FOCUS} pl-6`}>
        <TermLabel term={term} />
      </TreeItemLabel>
    </TreeItem>
  ));
}

function Chevron() {
  return (
    <TreeItemIndicator className="mt-1.5 inline-flex w-4 shrink-0 justify-center text-muted transition-transform data-[expanded]:rotate-90">
      <svg viewBox="0 0 8 8" width="8" height="8" aria-hidden="true" focusable="false">
        <path d="M2 1l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </TreeItemIndicator>
  );
}

function EntryHead({ entry, branch }: { entry: Entry; branch: boolean }) {
  const { report } = entry;
  return (
    <TreeItemLabel className={`${ROW} ${FOCUS} items-start py-3`}>
      {branch ? <Chevron /> : <span className="w-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-sm text-muted">{entry.input}</span>
        {"ok" in report ? (
          report.ok.rolls.map((roll, i) => (
            <span key={i} className="mt-1 flex">
              <RollLine roll={roll} showFormula={report.ok.rolls.length > 1} />
            </span>
          ))
        ) : (
          <ErrorBody error={report.error} />
        )}
      </span>
    </TreeItemLabel>
  );
}

function EntryItem({ entry }: { entry: Entry }) {
  const value = `entry-${entry.id}`;
  if (!("ok" in entry.report)) {
    return (
      <TreeItem value={value}>
        <EntryHead entry={entry} branch={false} />
      </TreeItem>
    );
  }

  const rolls: Roll[] = entry.report.ok.rolls;
  const perRoll = rolls.map((roll) => terms(roll));
  if (perRoll.every((list) => list.length === 0)) {
    return (
      <TreeItem value={value}>
        <EntryHead entry={entry} branch={false} />
      </TreeItem>
    );
  }

  return (
    <TreeItem value={value}>
      <EntryHead entry={entry} branch />
      <TreeGroup className="pb-2">
        {rolls.length === 1 ? (
          <TermItems prefix={value} list={perRoll[0] ?? []} />
        ) : (
          rolls.map((roll, i) =>
            (perRoll[i]?.length ?? 0) === 0 ? null : (
              <TreeItem key={i} value={`${value}/${i}`}>
                <TreeItemLabel className={`${ROW} ${FOCUS} pl-6`}>
                  <Chevron />
                  <span className="font-mono text-sm text-text-2">{roll.formula}</span>
                </TreeItemLabel>
                <TreeGroup>
                  <TermItems prefix={`${value}/${i}`} list={perRoll[i] ?? []} />
                </TreeGroup>
              </TreeItem>
            ),
          )
        )}
      </TreeGroup>
    </TreeItem>
  );
}

/**
 * The roll log: every roll this session, newest at the bottom, each entry a
 * branch that opens to its breakdown by term and die. The tree is one tab stop;
 * arrow keys move, Right and Left open and close, Home and End jump.
 */
export function RollLog({
  entries,
  treeRef,
  onEscape,
}: {
  entries: Entry[];
  treeRef: Ref<HTMLDivElement>;
  /** Esc inside the log: hand focus back to the formula box. */
  onEscape: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const count = entries.length;
  // Follow the newest entry; nothing to do for an empty log.
  useEffect(() => {
    if (count > 0) end.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
    }
  }

  return (
    <div className="flex flex-col">
      {count === 0 ? (
        <p className="m-0 text-sm text-muted">Rolls will appear here.</p>
      ) : (
        <Tree
          ref={treeRef}
          aria-label="Roll log"
          onKeyDown={onKeyDown}
          className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface px-3"
        >
          {entries.map((entry) => (
            <EntryItem key={entry.id} entry={entry} />
          ))}
        </Tree>
      )}
      <div ref={end} aria-hidden="true" />
    </div>
  );
}
