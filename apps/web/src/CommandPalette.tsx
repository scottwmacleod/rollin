import { useMemo, useState } from "react";
import { HEADER_ICON_BUTTON, HeaderLabel, SearchIcon } from "./HeaderLabel";
import { type PaletteGroup, type PaletteRow, paletteView } from "./palette";
import { useShortcutHint } from "./shortcuts";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "./ui";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

/**
 * The ⌘K palette (#86, option B): one input over presets, characters and
 * commands. Plain typing searches presets, commands and characters, `@` only
 * characters, `>` only commands. Eight rows show, then the list scrolls.
 */
export function CommandPalette({
  rows,
  open,
  onOpenChange,
  onRun,
  finalFocus,
}: {
  rows: readonly PaletteRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Carries out a chosen row. */
  onRun: (row: PaletteRow) => void;
  /** Where focus goes when the palette closes; see the dialog's `finalFocus`. */
  finalFocus: () => HTMLElement | null;
}) {
  const [query, setQuery] = useState("");
  const hint = useShortcutHint("k");
  const view = useMemo(() => paletteView(rows, query), [rows, query]);
  const byValue = useMemo(() => new Map(rows.map((row) => [row.value, row])), [rows]);
  const groups = (["Presets", "Characters", "Commands"] as PaletteGroup[])
    .map((group) => ({ group, rows: view.rows.filter((row) => row.group === group) }))
    .filter((g) => g.rows.length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogTrigger
        shortcut="mod+k"
        className={`inline-flex h-8 max-md:h-11 items-center gap-2 rounded-md border border-line-strong px-3 text-sm text-text-2 ${HEADER_ICON_BUTTON} ${focusRing}`}
      >
        <HeaderLabel label="Commands" hint={hint} icon={<SearchIcon />} />
      </DialogTrigger>
      <DialogBackdrop className="fixed inset-0 bg-black/50" />
      <DialogContent
        finalFocus={finalFocus}
        className="fixed top-[15vh] left-1/2 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-text shadow-lg"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          filter={false}
          query={query}
          onQueryChange={setQuery}
          onAction={(value) => {
            const row = byValue.get(value);
            if (row) onRun(row);
          }}
        >
          <CommandInput
            aria-label="Search presets, characters and commands"
            placeholder="Search presets, characters and commands"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-10 max-md:h-11 w-full rounded-md border border-line-strong bg-sunken px-3 text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          />
          <p className="m-0 mt-2 px-1 text-xs text-muted">
            {view.scope === "characters"
              ? "Characters only. Delete the @ to search everything."
              : view.scope === "commands"
                ? "Commands only. Delete the > to search everything."
                : "Type @ for characters or > for commands."}
          </p>
          <CommandEmpty className="px-1 py-3 text-sm text-muted">Nothing matches.</CommandEmpty>
          <CommandList className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {groups.map(({ group, rows: items }) => (
              <CommandGroup key={group} className="flex flex-col">
                <CommandGroupLabel className="px-2 py-1 text-xs font-medium text-text-2">
                  {group}
                </CommandGroupLabel>
                {items.map((row) => (
                  <CommandItem
                    key={row.value}
                    value={row.value}
                    label={row.label}
                    disabled={row.disabled}
                    className="flex min-h-9 max-md:min-h-11 items-center gap-3 rounded-md px-2 py-1 text-sm data-[highlighted]:bg-surface-hover data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-text aria-disabled:text-muted"
                  >
                    <span className={group === "Commands" ? "" : "font-mono"}>{row.label}</span>
                    {row.detail !== undefined && (
                      <span className="ml-auto truncate font-mono text-xs text-muted">
                        {row.detail}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
