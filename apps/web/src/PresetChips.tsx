import type { PresetEntry } from "./presets";
import { Button } from "./ui";

/**
 * The presets as one row of chips above the formula bar, for screens too narrow
 * for the sidebar. The row scrolls sideways on its own; with no presets it is absent.
 */
export function PresetChips({
  presets,
  onRoll,
}: {
  presets: PresetEntry[] | null;
  onRoll: (name: string) => void;
}) {
  if (presets === null || presets.length === 0) return null;
  return (
    <ul
      aria-label="Preset shortcuts"
      className="m-0 flex list-none gap-2 overflow-x-auto p-0 py-1 md:py-2 [scrollbar-width:thin]"
    >
      {presets.map(({ name, formula }) => (
        <li key={name} className="shrink-0">
          <Button
            type="button"
            title={formula}
            onClick={() => onRoll(name)}
            className="inline-flex h-9 max-md:h-11 items-center rounded-full border border-line-strong bg-surface px-4 font-mono text-sm text-text hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            {name}
          </Button>
        </li>
      ))}
    </ul>
  );
}
