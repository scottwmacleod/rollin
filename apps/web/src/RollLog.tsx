import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type Entry, ErrorBody, RollLine } from "./Result";
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tree,
  TreeItem,
  TreeItemLabel,
} from "./ui";
import { useScrollEdges } from "./useScrollEdges";

/** One entry: what was typed (or the preset), then a line per roll, or the error. */
function EntryItem({ entry, fresh }: { entry: Entry; fresh: boolean }) {
  const { report } = entry;
  return (
    <TreeItem value={`entry-${entry.id}`}>
      <TreeItemLabel className="block py-3 outline-none data-[highlighted]:outline-2 data-[highlighted]:outline-offset-2">
        <span className={`block${fresh ? " roll-arrive" : ""}`}>
          <span className="block font-mono text-sm text-ink-muted">
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
    </TreeItem>
  );
}

/** How close to the bottom still counts as being at the bottom, in pixels. */
const NEAR_BOTTOM = 48;

/**
 * The roll log: every roll this session, newest at the bottom, each entry one
 * line per roll that shows every die. It is a flat tree so it stays one tab stop:
 * Up and Down move between entries, Home and End jump.
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
  useScrollEdges(scroller);
  const count = entries.length;
  // The entry a roll made here just added. History that loads with the page or
  // arrives from another tab never changes `rollCount`, so it never arrives.
  const [freshId, setFreshId] = useState<number | null>(null);
  const latestId = entries[entries.length - 1]?.id;

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

  // Stay at the bottom while stuck, whatever changes the height: a new entry, the
  // keypad showing, the window resizing.
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

  // Marked before paint so the arrival starts with the entry's first frame.
  useLayoutEffect(() => {
    if (rollCount > 0) setFreshId(latestId ?? null);
    // Only a new roll marks an entry; `latestId` is read as of that roll.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  }, [rollCount]);

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
        {confirm ?? <h2 className="m-0 text-sm font-medium text-ink-body">Roll log</h2>}
        {!compact && count > 0 && !confirm && (
          <Menu onAction={(value) => value === "clear" && onClear()}>
            <MenuTrigger
              aria-label="Roll log menu"
              className="inline-flex h-8 max-md:h-11 min-w-8 max-md:min-w-11 items-center justify-center rounded-md border border-line-strong px-2 text-ink-body hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span aria-hidden="true">⋯</span>
            </MenuTrigger>
            <MenuContent className="min-w-40 rounded-md border border-line-strong bg-surface p-1 text-sm text-ink shadow-lg">
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
        className="scroll-fade min-h-0 flex-1 overflow-y-auto"
      >
        <div ref={content} className="px-1 pt-1">
          {count === 0 ? (
            <p className="m-0 py-3 text-sm text-ink-muted">Rolls will appear here.</p>
          ) : (
            <Tree
              ref={treeRef}
              aria-label="Roll log"
              onKeyDown={onKeyDown}
              className="flex max-w-[40rem] flex-col divide-y divide-line"
            >
              {entries.map((entry) => (
                <EntryItem key={entry.id} entry={entry} fresh={entry.id === freshId} />
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
          className="absolute right-3 bottom-3 inline-flex h-9 max-md:h-11 items-center rounded-full border border-line-strong bg-surface px-4 text-sm text-ink shadow-lg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Jump to newest
        </Button>
      )}
    </div>
  );
}
