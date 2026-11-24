import { EditButton } from "./EditButton";
import type { PresetEntry, PresetScope } from "./presets";
import { Button } from "./ui";

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
          <h2 id="presets-heading" className="m-0 text-sm font-medium text-foreground">
            Presets
          </h2>
          {presets !== null && list.length === 0 && (
            <span className="truncate text-xs text-muted-foreground">No presets yet</span>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onNew}>
          New preset
        </Button>
      </div>
      {list.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {list.map(({ name, formula, scope }) => (
            <li key={name} className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => onRoll(name)}
                className="h-auto min-h-11 min-w-0 flex-1 flex-col items-start justify-center gap-0 px-3 py-1 text-left"
              >
                <span className="font-mono text-sm text-foreground">{name}</span>
                <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
                  {formula}
                </span>
                {scope === "global" && (
                  <span className="text-xs text-muted-foreground">global</span>
                )}
              </Button>
              <EditButton label={`Edit ${name}`} onClick={() => onEdit(name, scope)} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
