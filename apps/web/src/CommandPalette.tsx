import { useMemo, useState } from "react";

import { HEADER_ICON_BUTTON, HeaderLabel, SearchIcon } from "./HeaderLabel";
import { type PaletteGroup, type PaletteRow, paletteView } from "./palette";
import { useShortcutHint } from "./shortcuts";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  useHotkey,
} from "./ui";

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
  onRun: (row: PaletteRow) => void;
  finalFocus: () => HTMLElement | null;
}) {
  const [query, setQuery] = useState("");
  const hint = useShortcutHint("k");
  const view = useMemo(() => paletteView(rows, query), [rows, query]);
  const groups = (["Presets", "Characters", "Commands"] as PaletteGroup[])
    .map((group) => ({ group, rows: view.rows.filter((row) => row.group === group) }))
    .filter((g) => g.rows.length > 0);

  useHotkey("k", () => onOpenChange(true));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={HEADER_ICON_BUTTON}>
          <HeaderLabel label="Commands" hint={hint} icon={<SearchIcon />} />
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => {
          const target = finalFocus();
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
        className="top-palette-offset w-palette max-w-palette translate-y-0 gap-0 p-3"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search presets, characters and commands, then press Enter to run one.
        </DialogDescription>
        <Command shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            aria-label="Search presets, characters and commands"
            placeholder="Search presets, characters and commands"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="m-0 mt-2 px-1 text-xs text-muted-foreground">
            {view.scope === "characters"
              ? "Characters only. Delete the @ to search everything."
              : view.scope === "commands"
                ? "Commands only. Delete the > to search everything."
                : "Type @ for characters or > for commands."}
          </p>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandList>
            {groups.map(({ group, rows: items }) => (
              <CommandGroup key={group} heading={group}>
                {items.map((row) => (
                  <CommandItem
                    key={row.value}
                    value={row.value}
                    disabled={row.disabled}
                    onSelect={() => onRun(row)}
                  >
                    <span className={group === "Commands" ? "" : "font-mono"}>{row.label}</span>
                    {row.detail !== undefined && (
                      <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
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
