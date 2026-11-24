import { EllipsisIcon } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tree,
  TreeItem,
} from "./ui";
import { useScrollEdges } from "./useScrollEdges";

function EntryItem({
  entry,
  fresh,
  tabbable,
  onActive,
}: {
  entry: Entry;
  fresh: boolean;
  tabbable: boolean;
  onActive: () => void;
}) {
  const { report } = entry;
  return (
    <TreeItem tabbable={tabbable} onActive={onActive} className="block rounded-none py-3">
      <div>
        <span className={`block${fresh ? " roll-arrive" : ""}`}>
          <span className="block font-mono text-sm text-muted-foreground">
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
      </div>
    </TreeItem>
  );
}

const NEAR_BOTTOM = 48;

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
  rollCount: number;
  onEscape: () => void;
  onClear: () => void;
  confirm: ReactNode;
  compact: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [away, setAway] = useState(false);
  useScrollEdges(scroller);
  const count = entries.length;
  const [freshId, setFreshId] = useState<number | null>(null);
  const latestId = entries[entries.length - 1]?.id;
  const [activeId, setActiveId] = useState<number | null>(null);
  const tabbableId = entries.some((e) => e.id === activeId) ? activeId : entries[0]?.id;

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

  useLayoutEffect(() => {
    if (rollCount > 0) setFreshId(latestId ?? null);
  }, [rollCount]);

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
        className={`min-h-9 items-center justify-between gap-2 border-b border-border px-1 pb-1 ${compact && !confirm ? "hidden" : "flex"}`}
      >
        {confirm ?? <h2 className="m-0 text-sm font-medium text-foreground">Roll log</h2>}
        {!compact && count > 0 && !confirm && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="Roll log menu">
                <EllipsisIcon aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onClear}>Clear roll log</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <p className="m-0 py-3 text-sm text-muted-foreground">Rolls will appear here.</p>
          ) : (
            <Tree
              ref={treeRef}
              aria-label="Roll log"
              onKeyDown={onKeyDown}
              className="flex max-w-160 flex-col divide-y divide-border"
            >
              {entries.map((entry) => (
                <EntryItem
                  key={entry.id}
                  entry={entry}
                  fresh={entry.id === freshId}
                  tabbable={entry.id === tabbableId}
                  onActive={() => setActiveId(entry.id)}
                />
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
          variant="outline"
          className="absolute right-3 bottom-3 shadow-md"
        >
          Jump to newest
        </Button>
      )}
    </div>
  );
}
