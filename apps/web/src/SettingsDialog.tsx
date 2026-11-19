import { BackupSection } from "./BackupSection";
import type { AddResult, Backup, Choices, Incoming } from "./backup";
import { HEADER_ICON_BUTTON, HeaderLabel, SettingsIcon } from "./HeaderLabel";
import { KEYPAD_SETTINGS, type KeypadSetting, type Settings } from "./settings";
import { useShortcutHint } from "./shortcuts";
import type { Storage } from "./storage";
import {
  Button,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui";

const KEYPAD_LABELS: Record<KeypadSetting, string> = { auto: "Auto", on: "On", off: "Off" };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-ink";

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
  /** Lets the command palette open the dialog; without them the dialog manages itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const hint = useShortcutHint(",");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        shortcut="mod+,"
        className={`inline-flex h-8 max-md:h-11 items-center gap-2 rounded-1 border border-control-line px-3 font-mono text-ui lowercase text-ink-body ${HEADER_ICON_BUTTON} ${focusRing}`}
      >
        <HeaderLabel label="Settings" hint={hint} icon={<SettingsIcon />} />
      </DialogTrigger>
      <DialogBackdrop className="fixed inset-0 bg-ground/60" />
      <DialogContent className="fixed top-1/2 left-1/2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-1 border border-line-strong bg-surface p-5 text-ink">
        <DialogTitle className="m-0 text-lg font-semibold">Settings</DialogTitle>
        <DialogDescription className="mt-1 mb-4 text-sm text-ink-body">
          Kept in this browser only.
        </DialogDescription>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm text-ink-body">Dice keypad</legend>
          {KEYPAD_SETTINGS.map((keypad) => (
            <label key={keypad} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="keypad"
                value={keypad}
                checked={settings.keypad === keypad}
                onChange={() => onChange({ ...settings, keypad })}
                className="accent-signal"
              />
              {KEYPAD_LABELS[keypad]}
              {keypad === "auto" && <span className="text-ink-muted">(on for touch screens)</span>}
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
          <DialogClose
            render={<Button type="button" />}
            className={`h-8 max-md:h-11 rounded-1 bg-signal px-4 font-mono text-ui-strong lowercase text-on-signal hover:bg-signal-hover ${focusRing}`}
          >
            Done
          </DialogClose>
        </div>
        <div className="mt-4 border-t border-line-strong pt-3 text-center">
          <a
            href="https://scottmacleod.co"
            target="_blank"
            rel="noopener noreferrer"
            className="sm-credit"
          >
            shipped by{" "}
            <span className="sm-mark">
              sm
              <span className="sm-cursor" aria-hidden="true" />
            </span>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
