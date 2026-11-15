import { type PresetEntry, type PresetScope } from "./presets";
import { Button } from "./ui";

const BUTTON =
  "whitespace-nowrap rounded-md border border-line-strong px-3 text-sm text-text-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

/**
 * The saved presets: click one to roll it, Edit to rename, change or delete it.
 * `presets` is `null` until storage has been read, so the list never flashes empty.
 */
export function PresetSidebar({
  presets,
  onRoll,
  onNew,
  onEdit,
}: {
  presets: PresetEntry[] | null;
  onRoll: (name: string) => void;
  onNew: () => void;
  onEdit: (name: string, scope: PresetScope) => void;
}) {
  const list = presets ?? [];
  return (
    <aside aria-labelledby="presets-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id="presets-heading" className="m-0 text-sm font-medium text-text-2">
            Presets
          </h2>
          {presets !== null && list.length === 0 && (
            <span className="truncate text-xs text-muted">No presets yet</span>
          )}
        </div>
        <Button type="button" onClick={onNew} className={`h-8 max-md:h-11 ${BUTTON}`}>
          New preset
        </Button>
      </div>
      {list.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {list.map(({ name, formula, scope }) => (
            <li key={name} className="flex gap-1">
              <Button
                type="button"
                onClick={() => onRoll(name)}
                className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-md border border-line bg-surface px-3 py-1 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
              >
                <span className="font-mono text-sm text-text">{name}</span>
                <span className="max-w-full truncate font-mono text-xs text-muted">{formula}</span>
                {scope === "global" && <span className="text-xs text-muted">global</span>}
              </Button>
              <Button
                type="button"
                aria-label={`Edit ${name}`}
                onClick={() => onEdit(name, scope)}
                className={`min-h-11 w-14 ${BUTTON}`}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
