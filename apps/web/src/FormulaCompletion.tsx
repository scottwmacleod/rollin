export function CompletionList({
  id,
  candidates,
  active,
  onPick,
}: {
  id: string;
  candidates: readonly string[];
  active: number;
  onPick: (candidate: string) => void;
}) {
  return (
    <div className="absolute right-0 bottom-full left-0 z-10 mb-1">
      <ul
        id={id}
        role="listbox"
        aria-label="Completions"
        className="m-0 flex max-h-56 list-none flex-col overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {candidates.map((candidate, i) => (
          <li
            key={candidate}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(candidate)}
            className="flex min-h-9 max-md:min-h-11 cursor-pointer items-center rounded-sm px-2 font-mono text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
          >
            {candidate}
          </li>
        ))}
      </ul>
      <div role="status" className="sr-only">
        {candidates.length === 1 ? "1 completion" : `${candidates.length} completions`}
      </div>
    </div>
  );
}
