import { roll } from "@rollin/engine";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  applyBackup,
  BACKUP_STATE_KEY,
  type Backup,
  type BackupData,
  type BackupState,
  buildBackup,
  downloadBackup,
  fingerprint,
  reminderDue,
  trackState,
} from "./backup";
import { CharacterDialog, type CharacterDialogMode } from "./CharacterDialog";
import { CharacterPanel } from "./CharacterPanel";
import { CommandPalette } from "./CommandPalette";
import {
  activeCharacter,
  addCharacter,
  CHARACTERS_KEY,
  cleanRoster,
  loadRoster,
  type Roster,
  removeCharacter,
  removeCharacterPreset,
  removeVariable,
  renameCharacter,
  setCharacterPreset,
  setCharacterRules,
  setVariable,
  sortedCharacters,
  switchCharacter,
  updateRoster,
} from "./characters";
import { accept, complete } from "./completion";
import { dieSource } from "./dice";
import { CompletionList } from "./FormulaCompletion";
import { type HistoryNav, pastFormulas, stepHistory } from "./history";
import { Keypad } from "./Keypad";
import { PresetDialog, type PresetDialogMode, type PresetRef } from "./PresetDialog";
import { PresetSidebar } from "./PresetSidebar";
import { type PaletteRow, paletteRows } from "./palette";
import {
  cleanPresets,
  effectivePresets,
  loadPresets,
  PRESETS_KEY,
  type PresetMap,
  type PresetScope,
  updatePresets,
} from "./presets";
import { useUpdate } from "./pwa";
import { type Entry, spoken } from "./Result";
import { RollLog } from "./RollLog";
import { capLog, loadLog, nextEntryId, ROLL_LOG_KEY, saveLog } from "./rollLog";
import { SettingsDialog } from "./SettingsDialog";
import {
  applyTheme,
  DEFAULT_SETTINGS,
  loadSettings,
  parseSettings,
  SETTINGS_KEY,
  type Settings,
  saveSettings,
} from "./settings";
import { openStorage, type Storage } from "./storage";
import { Button, Field, FieldLabel, Input } from "./ui";
import { VariableDialog, type VariableDialogMode } from "./VariableDialog";

export function App() {
  const [formula, setFormula] = useState("");
  const [historyNav, setHistoryNav] = useState<HistoryNav>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [kept, setKept] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [backupState, setBackupState] = useState<BackupState>({});
  const [presets, setPresets] = useState<PresetMap | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [dialog, setDialog] = useState<PresetDialogMode | null>(null);
  const [characterDialog, setCharacterDialog] = useState<CharacterDialogMode | null>(null);
  const [variableDialog, setVariableDialog] = useState<VariableDialogMode | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [caret, setCaret] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  // Whether an arrow key has chosen a completion; only then does Enter accept it.
  const [armed, setArmed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  /** What had focus when the palette opened, which it gives back when it closes. */
  const paletteFrom = useRef<HTMLElement | null>(null);
  /** Set when a palette command opens something that takes focus itself. */
  const handoff = useRef(false);
  const confirmYes = useRef<HTMLButtonElement>(null);
  const confirmFocus = useRef(false);
  const pendingCaret = useRef<number | null>(null);
  const storage = useRef<Storage | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const update = useUpdate();
  /** The character formulas roll for; `null` until storage has been read. */
  const acting = roster === null ? null : activeCharacter(roster);
  const available = useMemo(
    () => (presets === null || acting === null ? null : effectivePresets(presets, acting.presets)),
    [presets, acting],
  );
  const rows = useMemo(
    () =>
      available === null || acting === null || roster === null
        ? []
        : paletteRows({
            presets: available,
            characters: sortedCharacters(roster).map((c) => c.name),
            active: acting,
            hasLog: entries.length > 0,
          }),
    [available, acting, roster, entries.length],
  );
  const completion = useMemo(
    () =>
      complete(formula, caret ?? formula.length, {
        presets: available?.map((p) => p.name) ?? [],
        variables: acting === null ? [] : Object.keys(acting.vars),
      }),
    [formula, caret, available, acting],
  );
  const suggesting = focused && !dismissed && completion.candidates.length > 0;
  const current = Math.min(highlighted, Math.max(completion.candidates.length - 1, 0));

  // Open storage, load the saved log, and follow other tabs. Rolls made before
  // the load finishes are kept after the saved ones.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    void openStorage().then(async ({ storage: opened, kept: ok }) => {
      const saved = await loadLog(opened).catch(() => []);
      const savedPresets = await loadPresets(opened).catch(() => ({}));
      const savedRoster = await loadRoster(opened).catch(() => cleanRoster(undefined));
      const savedSettings = await loadSettings(opened).catch(() => null);
      const savedBackupState = await opened
        .get<BackupState>(BACKUP_STATE_KEY)
        .catch(() => undefined);
      if (cancelled) return;
      storage.current = opened;
      {
        const before = savedBackupState ?? {};
        const data: BackupData = {
          characters: savedRoster,
          globalPresets: savedPresets,
          settings: savedSettings ?? DEFAULT_SETTINGS,
        };
        const tracked = trackState(before, data, Date.now());
        setBackupState(tracked);
        if (tracked !== before) void opened.set(BACKUP_STATE_KEY, tracked).catch(() => {});
      }
      if (savedSettings) {
        setSettings(savedSettings);
        applyTheme(savedSettings.theme);
      }
      setKept(ok);
      setPresets((current) => ({ ...savedPresets, ...current }));
      setRoster((current) => current ?? savedRoster);
      setEntries((current) => {
        const first = nextEntryId(saved);
        const merged = capLog([...saved, ...current.map((e, i) => ({ ...e, id: first + i }))]);
        if (current.length > 0) void saveLog(opened, merged).catch(() => setKept(false));
        return merged;
      });
      const stopLog = opened.subscribe<Entry[]>(ROLL_LOG_KEY, (value) =>
        setEntries(Array.isArray(value) ? capLog(value) : []),
      );
      const stopSettings = opened.subscribe<unknown>(SETTINGS_KEY, (value) => {
        const next = parseSettings(value);
        setSettings(next);
        applyTheme(next.theme);
      });
      const stopPresets = opened.subscribe<PresetMap>(PRESETS_KEY, (value) =>
        setPresets(cleanPresets(value)),
      );
      const stopRoster = opened.subscribe<unknown>(CHARACTERS_KEY, (value) =>
        setRoster(cleanRoster(value)),
      );
      unsubscribe = () => {
        stopRoster();
        stopLog();
        stopSettings();
        stopPresets();
      };
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  function changeSettings(next: Settings) {
    setSettings(next);
    applyTheme(next.theme);
    if (storage.current) void saveSettings(storage.current, next).catch(() => setKept(false));
  }

  function changeBackupState(next: BackupState) {
    setBackupState(next);
    if (storage.current) void storage.current.set(BACKUP_STATE_KEY, next).catch(() => {});
  }

  /** A file now holds this data, so the reminder has nothing to nag about. */
  function markBackedUp(backup: Backup) {
    changeBackupState({ exported: fingerprint(backup.data) });
  }

  async function exportNow() {
    if (!storage.current) return;
    try {
      const backup = await buildBackup(storage.current, { rollLog: false });
      downloadBackup(backup);
      markBackedUp(backup);
    } catch {
      setKept(false);
    }
  }

  /** Replaces what is saved with the backup's, then shows it. Throws if it can't be saved, leaving the page as it was. */
  async function importBackup(backup: Backup) {
    if (!storage.current) throw new Error("no storage");
    await applyBackup(storage.current, backup);
    setRoster(backup.data.characters);
    setPresets(backup.data.globalPresets);
    setSettings(backup.data.settings);
    applyTheme(backup.data.settings.theme);
    if (backup.data.rollLog !== undefined) setEntries(backup.data.rollLog);
    markBackedUp(backup);
  }

  /** Remembers what had focus, so closing the dialog can give it back. */
  function remember() {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function openDialog(mode: PresetDialogMode) {
    remember();
    setDialog(mode);
  }

  function openCharacterDialog(mode: CharacterDialogMode) {
    remember();
    setCharacterDialog(mode);
  }

  function openVariableDialog(mode: VariableDialogMode) {
    remember();
    setVariableDialog(mode);
  }

  // When a dialog closes, focus goes back to what opened it, or to the formula box
  // if that is gone (a renamed or deleted preset's Edit button).
  useEffect(() => {
    if (dialog !== null || characterDialog !== null || variableDialog !== null) return;
    const back = opener.current;
    opener.current = null;
    if (back === null) return;
    (back.isConnected ? back : input.current)?.focus();
  }, [dialog, characterDialog, variableDialog]);

  // After a completion is accepted, the caret goes to the end of what was inserted.
  useEffect(() => {
    const at = pendingCaret.current;
    pendingCaret.current = null;
    if (at !== null) input.current?.setSelectionRange(at, at);
  }, [formula]);

  // The caret moves with the arrow keys and the pointer as well as with typing.
  useEffect(() => {
    if (!focused) return;
    const follow = () => {
      if (document.activeElement === input.current) setCaret(input.current?.selectionStart ?? null);
    };
    document.addEventListener("selectionchange", follow);
    return () => document.removeEventListener("selectionchange", follow);
  }, [focused]);

  // "Clear roll log" in the palette asks inline, so focus moves to the answer.
  useEffect(() => {
    if (confirming && confirmFocus.current) {
      confirmFocus.current = false;
      confirmYes.current?.focus();
    }
  }, [confirming]);

  function changeFormula(next: string) {
    setHistoryNav(null);
    setFormula(next);
    setHighlighted(0);
    setArmed(false);
    setDismissed(false);
  }

  function pick(candidate: string) {
    const done = accept(formula, caret ?? formula.length, completion, candidate);
    pendingCaret.current = done.caret;
    setCaret(done.caret);
    changeFormula(done.line);
    input.current?.focus();
  }

  function openPalette(next: boolean) {
    if (next) {
      const from = document.activeElement;
      paletteFrom.current = from instanceof HTMLElement && from !== document.body ? from : null;
      handoff.current = false;
    }
    setPaletteOpen(next);
  }

  /** Where focus goes when the palette closes: where it was, or the formula box. */
  function paletteFocus(): HTMLElement | null {
    if (handoff.current && document.activeElement instanceof HTMLElement) {
      return document.activeElement;
    }
    const back = paletteFrom.current;
    return back?.isConnected ? back : input.current;
  }

  /** Runs what a palette row says. Anything that opens a dialog gives focus back to where the palette began. */
  function runPalette(row: PaletteRow) {
    const action = row.action;
    setPaletteOpen(false);
    const handOff = (open: () => void) => {
      opener.current = paletteFrom.current;
      handoff.current = true;
      open();
    };
    switch (action.type) {
      case "roll":
        rollLine(action.name);
        return;
      case "switch":
        void changeRoster((r) => switchCharacter(r, action.name));
        return;
      case "edit-preset":
        handOff(() => setDialog({ kind: "edit", name: action.name, scope: action.scope }));
        return;
      case "edit-character":
        handOff(() => setCharacterDialog({ kind: "edit", name: action.name }));
        return;
      case "edit-variable":
        handOff(() => setVariableDialog({ kind: "edit", name: action.name }));
        return;
      case "command":
        switch (action.id) {
          case "new-preset":
            handOff(() => setDialog({ kind: "new", formula: formula.trim() }));
            return;
          case "new-character":
            handOff(() => setCharacterDialog({ kind: "new" }));
            return;
          case "new-variable":
            handOff(() => setVariableDialog({ kind: "new" }));
            return;
          case "export":
            void exportNow();
            return;
          case "settings":
          case "import":
            // Choosing a file and confirming the replace happen in Settings.
            handoff.current = true;
            setSettingsOpen(true);
            return;
          case "clear-log":
            handoff.current = true;
            confirmFocus.current = true;
            setConfirming(true);
            return;
        }
    }
  }

  function clearLog() {
    setConfirming(false);
    setEntries([]);
    void storage.current?.delete(ROLL_LOG_KEY).catch(() => setKept(false));
    input.current?.focus();
  }

  /** Rolls what was typed, or a preset's name, and puts the result in the log. */
  function rollLine(text: string) {
    const report = roll(text, dieSource(), {
      globalPresets: presets ?? {},
      character: acting ?? undefined,
    });
    const next = capLog([...entries, { id: nextEntryId(entries), input: text, report }]);
    setEntries(next);
    if (storage.current) void saveLog(storage.current, next).catch(() => setKept(false));
    const preset = "ok" in report ? report.ok.preset : null;
    const what = preset === null ? text : `${preset[0]} (${preset[1]})`;
    setAnnouncement(
      "ok" in report
        ? `Rolled ${what}: ${report.ok.rolls.map(spoken).join(", ")}`
        : `Error: ${report.error.message}`,
    );
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = formula.trim();
    setHistoryNav(null);
    if (text !== "") rollLine(text);
  }

  /** Up and Down in the formula box step through past rolls, like a shell. Returns whether it acted. */
  function stepThroughHistory(event: KeyboardEvent): boolean {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
    const step = stepHistory(
      pastFormulas(entries.map((e) => e.input)),
      historyNav,
      event.key === "ArrowUp" ? "up" : "down",
      formula,
    );
    if (step === null) return false;
    event.preventDefault();
    pendingCaret.current = step.text.length;
    setCaret(step.text.length);
    changeFormula(step.text);
    setHistoryNav(step.nav);
    setDismissed(true);
    return true;
  }

  /**
   * Saves a preset in `scope`, dropping the one it replaces when it was renamed
   * or moved. Waits for the write.
   */
  async function savePreset(
    name: string,
    text: string,
    scope: PresetScope,
    from: PresetRef | null,
  ) {
    if (scope === "global") {
      await changePresets((presets) => ({ ...presets, [name]: text }));
    } else if (acting) {
      await changeRoster((r) =>
        setCharacterPreset(
          r,
          acting.name,
          name,
          text,
          from?.scope === "character" ? from.name : null,
        ),
      );
    }
    if (from !== null && !(from.scope === scope && from.name === name)) await removePreset(from);
  }

  async function removePreset({ name, scope }: PresetRef) {
    if (scope === "global") {
      await changePresets((presets) => {
        const next = { ...presets };
        delete next[name];
        return next;
      });
    } else if (acting) {
      await changeRoster((r) => removeCharacterPreset(r, acting.name, name));
    }
  }

  /** Changes the roster, reading what is saved just before writing, so another tab's edit is kept. */
  async function changeRoster(apply: (roster: Roster) => Roster) {
    if (storage.current) {
      try {
        setRoster(await updateRoster(storage.current, apply));
        return;
      } catch {
        setKept(false);
      }
    }
    setRoster((r) => cleanRoster(apply(r ?? cleanRoster(undefined))));
  }

  async function changePresets(apply: (current: PresetMap) => PresetMap) {
    if (storage.current) {
      try {
        setPresets(await updatePresets(storage.current, apply));
        return;
      } catch {
        setKept(false);
      }
    }
    setPresets((current) => apply(current ?? {}));
  }

  /**
   * Keys in the formula box. With suggestions open, the arrows move through
   * them, Tab accepts the highlighted one, Enter accepts it only after an arrow
   * chose it (otherwise Enter rolls), and Esc closes them. Otherwise Up and Down
   * step through past rolls, and Esc moves to the newest log entry (the log is
   * above the box).
   */
  function formulaKeys(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    if (suggesting) {
      const count = completion.candidates.length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setArmed(true);
        setHighlighted((current + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
        return;
      }
      const chosen = completion.candidates[current];
      if (
        chosen !== undefined &&
        ((event.key === "Tab" && !event.shiftKey) || (event.key === "Enter" && armed))
      ) {
        event.preventDefault();
        pick(chosen);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (stepThroughHistory(event)) return;
    focusLog(event);
  }

  /** Esc in the formula box moves to the newest log entry (the log is above it). */
  function focusLog(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    const items = log.current?.querySelectorAll<HTMLElement>('[role="treeitem"]');
    if (!items || items.length === 0) return;
    event.preventDefault();
    const current = log.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
    (current ?? items[items.length - 1])?.focus();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-4 md:py-10">
      <header className="flex items-center justify-between gap-4">
        <span className="wordmark">
          <img
            className="wordmark-light"
            src="/rollin-wordmark-light.svg"
            alt=""
            width={162}
            height={51}
          />
          <img
            className="wordmark-dark"
            src="/rollin-wordmark-dark.svg"
            alt=""
            width={162}
            height={51}
          />
        </span>
        <h1 className="sr-only">rollin</h1>
        <div className="flex items-center gap-2">
          <CommandPalette
            rows={rows}
            open={paletteOpen}
            onOpenChange={openPalette}
            onRun={runPalette}
            finalFocus={paletteFocus}
          />
          <SettingsDialog
            settings={settings}
            onChange={changeSettings}
            storage={() => storage.current}
            onExported={markBackedUp}
            onImported={importBackup}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />
        </div>
      </header>

      {update.available && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
        >
          <span>A new version of rollin is ready.</span>
          <Button
            type="button"
            onClick={update.reload}
            className="h-8 max-md:h-11 rounded-md bg-signal px-3 font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            Reload to update
          </Button>
        </div>
      )}

      {reminderDue(backupState, Date.now()) && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
        >
          <span>Your characters and presets live only in this browser. Save a backup file?</span>
          <Button
            type="button"
            onClick={() => void exportNow()}
            className="h-8 max-md:h-11 rounded-md bg-signal px-3 font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            Export backup
          </Button>
          <Button
            type="button"
            onClick={() => changeBackupState({ ...backupState, dismissedAt: Date.now() })}
            className="h-8 max-md:h-11 rounded-md border border-line-strong px-3 text-text-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            Not now
          </Button>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-6">
          <CharacterPanel
            roster={roster}
            active={acting}
            onSwitch={(name) => void changeRoster((r) => switchCharacter(r, name))}
            onNew={() => openCharacterDialog({ kind: "new" })}
            onEdit={(name) => openCharacterDialog({ kind: "edit", name })}
            onNewVariable={() => openVariableDialog({ kind: "new" })}
            onEditVariable={(name) => openVariableDialog({ kind: "edit", name })}
          />
          <PresetSidebar
            presets={available}
            onRoll={rollLine}
            onNew={() => openDialog({ kind: "new", formula: formula.trim() })}
            onEdit={(name, scope) => openDialog({ kind: "edit", name, scope })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <RollLog entries={entries} treeRef={log} onEscape={() => input.current?.focus()} />

          {!kept && (
            <p className="m-0 text-sm text-muted">
              Your browser is blocking storage, so the roll log, your presets and your settings
              won't be kept when you close or reload this page.
            </p>
          )}

          {entries.length > 0 &&
            (confirming ? (
              <div
                role="group"
                aria-label="Confirm clear"
                className="flex items-center gap-3 text-sm"
              >
                <span>Clear the whole roll log?</span>
                <Button
                  type="button"
                  ref={confirmYes}
                  onClick={clearLog}
                  className="h-8 max-md:h-11 rounded-md bg-signal px-3 font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
                >
                  Yes, clear
                </Button>
                <Button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-8 max-md:h-11 rounded-md border border-line-strong px-3 text-text-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div>
                <Button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="h-8 max-md:h-11 rounded-md border border-line-strong px-3 text-sm text-text-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
                >
                  Clear
                </Button>
              </div>
            ))}

          <div role="status" className="sr-only">
            {announcement}
          </div>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="sticky bottom-0 flex flex-col gap-3 bg-bg py-3 sm:flex-row sm:items-end"
      >
        <Field name="formula" className="relative flex flex-1 flex-col gap-1">
          <FieldLabel className="text-sm text-text-2">Formula</FieldLabel>
          <Input
            value={formula}
            onValueChange={changeFormula}
            placeholder="2d6+3"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            ref={input}
            onKeyDown={formulaKeys}
            onFocus={(event) => {
              setFocused(true);
              setCaret(event.currentTarget.selectionStart);
            }}
            onBlur={() => setFocused(false)}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggesting}
            aria-controls={suggesting ? "formula-completions" : undefined}
            aria-activedescendant={suggesting ? `formula-completions-${current}` : undefined}
            className="h-10 max-md:h-11 w-full rounded-md border border-line-strong bg-surface px-3 font-mono text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          />
          {suggesting && (
            <CompletionList
              id="formula-completions"
              candidates={completion.candidates}
              active={current}
              onPick={pick}
            />
          )}
        </Field>
        <Button
          type="submit"
          className="max-md:hidden inline-flex h-10 max-md:h-11 items-center justify-center rounded-md bg-signal px-5 text-sm font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
        >
          Roll
        </Button>
        <Button
          type="button"
          disabled={presets === null || acting === null}
          onClick={() => openDialog({ kind: "new", formula: formula.trim() })}
          className="inline-flex h-10 max-md:h-11 items-center justify-center rounded-md border border-line-strong px-4 text-sm text-text-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50"
        >
          Save as preset
        </Button>
        <Keypad formula={formula} onChange={changeFormula} onRoll={() => submit()} />
      </form>

      {characterDialog !== null && roster !== null && (
        <CharacterDialog
          mode={characterDialog}
          roster={roster}
          onSave={async (name, from, rules) =>
            changeRoster((r) =>
              setCharacterRules(
                from === null ? addCharacter(r, name) : renameCharacter(r, from, name),
                name,
                rules,
              ),
            )
          }
          onDelete={async (name) => changeRoster((r) => removeCharacter(r, name))}
          onClose={() => setCharacterDialog(null)}
        />
      )}

      {variableDialog !== null && acting !== null && (
        <VariableDialog
          mode={variableDialog}
          character={acting}
          onSave={async (name, value, from) =>
            changeRoster((r) => setVariable(r, acting.name, name, value, from))
          }
          onDelete={async (name) => changeRoster((r) => removeVariable(r, acting.name, name))}
          onClose={() => setVariableDialog(null)}
        />
      )}

      {dialog !== null && presets !== null && acting !== null && (
        <PresetDialog
          mode={dialog}
          presets={presets}
          character={acting}
          onSave={savePreset}
          onDelete={removePreset}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}
