import type { Die, Roll } from "@rollin/engine";
import { type KeyboardEvent, type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { type Entry, ErrorBody, Outcome, outcomeClass, RollLine } from "./Result";
import { type Term, terms } from "./terms";
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "./ui";

/**
 * How a die that was not kept reads. Dropped and rerolled dice are faded and
 * struck through with no word on screen; the word is generated content, which
 * screen readers read in the die's name without it being a second piece of visible
 * text for the name to disagree with. Exploded dice keep a visible word.
 */
const MARKS: Record<string, { word?: string; className: string }> = {
  dropped: { className: "line-through opacity-60 after:sr-only after:content-['_dropped']" },
  rerolled: { className: "line-through opacity-60 after:sr-only after:content-['_rerolled']" },
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
      {mark?.word && (
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
        <span className="block font-mono text-sm text-muted">
          {"ok" in report && report.ok.preset !== null
            ? `${report.ok.preset[0]} · ${report.ok.preset[1]}`
            : entry.input}
        </span>
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

/** How close to the bottom still counts as being at the bottom, in pixels. */
const NEAR_BOTTOM = 48;

/**
 * The roll log: every roll this session, newest at the bottom, each entry a
 * branch that opens to its breakdown by term and die. The tree is one tab stop;
 * arrow keys move, Right and Left open and close, Home and End jump.
 *
 * It is the only part of the page that scrolls. Like a chat it sticks to the
 * bottom while the reader is there, lets go once they scroll up, and offers a way
 * back. A roll made here (`rollCount` goes up) always brings it back to the bottom.
 */
export function RollLog({
  entries,
  treeRef,
  rollCount,
  onEscape,
  onClear,
  confirm,
  compact,
}: {
  entries: Entry[];
  treeRef: Ref<HTMLDivElement>;
  /** Rolls made on this page; a new one scrolls to the bottom whatever the reader was doing. */
  rollCount: number;
  /** Esc inside the log: hand focus back to the formula box. */
  onEscape: () => void;
  /** Starts clearing the log (the app asks for confirmation). */
  onClear: () => void;
  /** The inline "Clear the whole roll log?" question, shown in the header while it is asked. */
  confirm: ReactNode;
  /** No header row (and no menu: Clear lives elsewhere) so a phone's log keeps its height; the confirmation still shows. */
  compact: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [away, setAway] = useState(false);
  const count = entries.length;

  function toBottom() {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM;
    stuck.current = near;
    setAway(!near);
  }

  // Stay at the bottom while stuck, whatever changes the height: a new entry, an
  // entry opening, the keypad showing, the window resizing.
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const follow = () => {
      if (stuck.current) toBottom();
    };
    const observer = new ResizeObserver(follow);
    observer.observe(el);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  // A roll made here shows its result at once.
  useEffect(() => {
    if (rollCount === 0) return;
    stuck.current = true;
    setAway(false);
    toBottom();
  }, [rollCount]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={`min-h-9 items-center justify-between gap-2 border-b border-line px-1 pb-1 ${compact && !confirm ? "hidden" : "flex"}`}
      >
        {confirm ?? <h2 className="m-0 text-sm font-medium text-text-2">Roll log</h2>}
        {!compact && count > 0 && !confirm && (
          <Menu onAction={(value) => value === "clear" && onClear()}>
            <MenuTrigger
              aria-label="Roll log menu"
              className="inline-flex h-8 max-md:h-11 min-w-8 max-md:min-w-11 items-center justify-center rounded-md border border-line-strong px-2 text-text-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
            >
              <span aria-hidden="true">⋯</span>
            </MenuTrigger>
            <MenuContent className="min-w-40 rounded-md border border-line-strong bg-surface p-1 text-sm text-text shadow-lg">
              <MenuItem
                value="clear"
                className="flex min-h-9 max-md:min-h-11 cursor-default items-center rounded px-3 data-[highlighted]:bg-surface-hover"
              >
                Clear roll log
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        data-roll-scroll=""
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div ref={content} className="px-1 pt-1">
          {count === 0 ? (
            <p className="m-0 py-3 text-sm text-muted">Rolls will appear here.</p>
          ) : (
            <Tree
              ref={treeRef}
              aria-label="Roll log"
              onKeyDown={onKeyDown}
              className="flex flex-col divide-y divide-line"
            >
              {entries.map((entry) => (
                <EntryItem key={entry.id} entry={entry} />
              ))}
            </Tree>
          )}
        </div>
      </div>
      {away && count > 0 && (
        <Button
          type="button"
          onClick={() => {
            stuck.current = true;
            setAway(false);
            toBottom();
          }}
          className="absolute right-3 bottom-3 inline-flex h-9 max-md:h-11 items-center rounded-full border border-line-strong bg-surface px-4 text-sm text-text shadow-lg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
        >
          Jump to newest
        </Button>
      )}
    </div>
  );
}
