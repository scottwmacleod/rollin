import type { PresetEntry } from "./presets";
import { Button } from "./ui";

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
      className="m-0 flex list-none gap-2 overflow-x-auto p-0 py-1 md:py-2 scrollbar-thin"
    >
      {presets.map(({ name, formula }) => (
        <li key={name} className="shrink-0">
          <Button
            type="button"
            variant="outline"
            title={formula}
            onClick={() => onRoll(name)}
            className="font-mono"
          >
            {name}
          </Button>
        </li>
      ))}
    </ul>
  );
}
