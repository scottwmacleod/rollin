/** One suggestion list under the formula box; the box itself owns focus and keys (see App). */
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
        className="m-0 flex max-h-56 list-none flex-col overflow-y-auto rounded-md border border-line-strong bg-surface p-1 shadow-lg"
      >
        {candidates.map((candidate, i) => (
          // Keys drive the listbox from the input (aria-activedescendant); a click picks.
          <li
            key={candidate}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(candidate)}
            className="flex min-h-9 max-md:min-h-11 cursor-pointer items-center rounded px-2 font-mono text-sm aria-selected:bg-surface-hover aria-selected:outline-2 aria-selected:-outline-offset-2 aria-selected:outline-text"
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
