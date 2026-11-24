import { useState } from "react";

import type { AddResult, Backup, Choices, Incoming } from "./backup";
import { BackupSection } from "./BackupSection";
import { HEADER_ICON_BUTTON, HeaderLabel, SettingsIcon } from "./HeaderLabel";
import { KEYPAD_SETTINGS, type KeypadSetting, type Settings } from "./settings";
import { useShortcutHint } from "./shortcuts";
import type { Storage } from "./storage";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useHotkey,
} from "./ui";

const KEYPAD_LABELS: Record<KeypadSetting, string> = { auto: "Auto", on: "On", off: "Off" };

export function SettingsDialog({
  settings,
  onChange,
  storage,
  onExported,
  onImported,
  onAdded,
  open,
  onOpenChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  storage: () => Storage | null;
  onExported: (backup: Backup) => void;
  onImported: (backup: Backup) => Promise<void>;
  onAdded: (incoming: Incoming, choices: Choices) => Promise<AddResult>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const hint = useShortcutHint(",");
  const [innerOpen, setInnerOpen] = useState(false);
  const shown = open ?? innerOpen;
  const change = onOpenChange ?? setInnerOpen;
  useHotkey(",", () => change(true));
  return (
    <Dialog open={shown} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={HEADER_ICON_BUTTON}>
          <HeaderLabel label="Settings" hint={hint} icon={<SettingsIcon />} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-dvh overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Kept in this browser only.</DialogDescription>
        </DialogHeader>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm text-foreground">Dice keypad</legend>
          {KEYPAD_SETTINGS.map((keypad) => (
            <label key={keypad} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="keypad"
                value={keypad}
                checked={settings.keypad === keypad}
                onChange={() => onChange({ ...settings, keypad })}
                className="accent-primary"
              />
              {KEYPAD_LABELS[keypad]}
              {keypad === "auto" && (
                <span className="text-muted-foreground">(on for touch screens)</span>
              )}
            </label>
          ))}
        </fieldset>
        <BackupSection
          storage={storage}
          onExported={onExported}
          onImported={onImported}
          onAdded={onAdded}
        />
        <div className="mt-5 flex justify-end">
          <DialogClose asChild>
            <Button type="button">Done</Button>
          </DialogClose>
        </div>
        <div className="mt-4 border-t border-border pt-3 text-center">
          <a
            href="https://scottmacleod.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            shipped by sm
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
