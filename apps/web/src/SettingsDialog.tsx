import { type Settings, THEMES, type Theme } from "./settings";
import {
  Button,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "./ui";

const LABELS: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

export function SettingsDialog({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger
        shortcut="mod+,"
        className={`inline-flex h-8 items-center gap-2 rounded-md border border-line-strong px-3 text-sm text-text-2 ${focusRing}`}
      >
        Settings
        <DialogShortcut className="text-muted" />
      </DialogTrigger>
      <DialogBackdrop className="fixed inset-0 bg-black/50" />
      <DialogContent className="fixed top-1/2 left-1/2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line-strong bg-surface p-5 text-text">
        <DialogTitle className="m-0 text-lg font-semibold">Settings</DialogTitle>
        <DialogDescription className="mt-1 mb-4 text-sm text-text-2">
          Kept in this browser only.
        </DialogDescription>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm text-text-2">Theme</legend>
          {THEMES.map((theme) => (
            <label key={theme} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={settings.theme === theme}
                onChange={() => onChange({ ...settings, theme })}
                className="accent-signal"
              />
              {LABELS[theme]}
              {theme === "system" && <span className="text-muted">(follow your device)</span>}
            </label>
          ))}
        </fieldset>
        <div className="mt-5 flex justify-end">
          <DialogClose
            render={<Button type="button" />}
            className={`h-8 rounded-md bg-signal px-4 text-sm font-medium text-on-signal hover:opacity-90 ${focusRing}`}
          >
            Done
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
