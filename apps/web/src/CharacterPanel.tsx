import { type Character, type Roster, sortedCharacters, sortedVars } from "./characters";
import { Button } from "./ui";

const BUTTON =
  "whitespace-nowrap rounded-md border border-line-strong px-3 text-sm text-text-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

/**
 * The character switcher (#86, option A) and the active character's variables.
 * The list holds eight rows, then scrolls. `roster` is `null` until storage has
 * been read, so the list never flashes empty.
 */
export function CharacterPanel({
  roster,
  active,
  onSwitch,
  onNew,
  onEdit,
  onNewVariable,
  onEditVariable,
}: {
  roster: Roster | null;
  active: Character | null;
  onSwitch: (name: string) => void;
  onNew: () => void;
  onEdit: (name: string) => void;
  onNewVariable: () => void;
  onEditVariable: (name: string) => void;
}) {
  const list = roster === null ? [] : sortedCharacters(roster);
  const vars = active === null ? [] : sortedVars(active);
  return (
    <>
      <aside aria-labelledby="characters-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="characters-heading" className="m-0 text-sm font-medium text-text-2">
            Characters
          </h2>
          <Button
            type="button"
            disabled={roster === null}
            onClick={onNew}
            className={`h-8 max-md:h-11 ${BUTTON}`}
          >
            New character
          </Button>
        </div>
        {/* Until storage is read, hold one row's height (every roster has a character),
            so the panels below don't jump when it arrives. Modern Web Guidance: performance. */}
        {roster === null && <div aria-hidden="true" className="min-h-11" />}
        {list.length > 0 && (
          <ul className="m-0 flex max-h-56 list-none flex-col gap-1 overflow-y-auto p-0">
            {list.map((character) => (
              <li key={character.name} className="flex gap-1">
                <Button
                  type="button"
                  aria-pressed={character.name === roster?.active}
                  onClick={() => onSwitch(character.name)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 py-1 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text aria-pressed:border-line-strong aria-pressed:bg-surface-hover"
                >
                  <span className="truncate font-mono text-sm text-text">{character.name}</span>
                  {character.name === roster?.active && (
                    <span className="ml-auto text-xs text-muted">active</span>
                  )}
                </Button>
                <Button
                  type="button"
                  aria-label={`Edit ${character.name}`}
                  onClick={() => onEdit(character.name)}
                  className={`min-h-11 w-14 ${BUTTON}`}
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <aside aria-labelledby="variables-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 id="variables-heading" className="m-0 shrink-0 text-sm font-medium text-text-2">
              Variables{active === null ? "" : ` · ${active.name}`}
            </h2>
            {active !== null && vars.length === 0 && (
              <span className="truncate text-xs text-muted">No variables yet</span>
            )}
          </div>
          <Button
            type="button"
            disabled={active === null}
            onClick={onNewVariable}
            className={`h-8 max-md:h-11 ${BUTTON}`}
          >
            New variable
          </Button>
        </div>
        {vars.length > 0 && (
          <ul className="m-0 flex max-h-56 list-none flex-col gap-1 overflow-y-auto p-0">
            {vars.map(([name, value]) => (
              <li key={name} className="flex gap-1">
                <span className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-1 font-mono text-sm">
                  <span className="truncate text-text">@{name}</span>
                  <span className="text-text-2">{value}</span>
                </span>
                <Button
                  type="button"
                  aria-label={`Edit @${name}`}
                  onClick={() => onEditVariable(name)}
                  className={`min-h-11 w-14 ${BUTTON}`}
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
