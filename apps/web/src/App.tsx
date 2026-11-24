import { roll } from "@rollin/engine";
import { ChevronDownIcon, EllipsisIcon, Grid3x3Icon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { captureRoll, type RollSource } from "./analytics";
import {
  applyAdd,
  applyBackup,
  BACKUP_STATE_KEY,
  type Backup,
  type BackupData,
  type BackupState,
  buildBackup,
  type Choices,
  downloadBackup,
  fingerprint,
  type Incoming,
  reminderDue,
  trackState,
} from "./backup";
import { CharacterDialog, type CharacterDialogMode } from "./CharacterDialog";
import { CharacterPanel } from "./CharacterPanel";
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
import { CommandPalette } from "./CommandPalette";
import { accept, complete } from "./completion";
import { dieSource } from "./dice";
import { CompletionList } from "./FormulaCompletion";
import { type HistoryNav, pastFormulas, stepHistory } from "./history";
import { Keypad } from "./Keypad";
import { type PaletteRow, paletteRows } from "./palette";
import { PresetChips } from "./PresetChips";
import { PresetDialog, type PresetDialogMode, type PresetRef } from "./PresetDialog";
import {
  cleanPresets,
  effectivePresets,
  loadPresets,
  PRESETS_KEY,
  type PresetMap,
  type PresetScope,
  updatePresets,
} from "./presets";
import { PresetSidebar } from "./PresetSidebar";
import { useUpdate } from "./pwa";
import { type Entry, spoken } from "./Result";
import { RollLog } from "./RollLog";
import { addEntry, cleanLog, loadLog, mergeLoaded, ROLL_LOG_KEY, saveLog } from "./rollLog.ts";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  parseSettings,
  SETTINGS_KEY,
  type Settings,
  saveSettings,
} from "./settings";
import { SettingsDialog } from "./SettingsDialog";
import { openStorage, type Storage } from "./storage";
import { useSwipeClose } from "./swipeClose";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from "./ui";
import { SMALL, TOUCH, useMedia, WIDE } from "./useMedia";
import { useScrollEdges } from "./useScrollEdges";
import { VariableDialog, type VariableDialogMode } from "./VariableDialog";

export function App() {
  const [formula, setFormula] = useState("");
  const [historyNav, setHistoryNav] = useState<HistoryNav>(null);
  const [fresh, setFresh] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const saveLogSoon = useRef(false);
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
  const [sideOpen, setSideOpen] = useState(false);
  const swipe = useSwipeClose(() => setSideOpen(false));
  const [rollCount, setRollCount] = useState(0);
  const [caret, setCaret] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [armed, setArmed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const paletteFrom = useRef<HTMLElement | null>(null);
  const handoff = useRef(false);
  const confirmYes = useRef<HTMLButtonElement>(null);
  const confirmFocus = useRef(false);
  const pendingCaret = useRef<number | null>(null);
  const storage = useRef<Storage | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);
  const update = useUpdate();
  const wide = useMedia(WIDE);
  useScrollEdges(sidebar, wide);
  const touch = useMedia(TOUCH);
  const small = useMedia(SMALL);
  const keypadOn = settings.keypad === "on" || (settings.keypad === "auto" && touch);
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

  useEffect(() => {
    if (!saveLogSoon.current || !storage.current) return;
    saveLogSoon.current = false;
    void saveLog(storage.current, entries).catch(() => setKept(false));
  }, [entries]);

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
      if (savedSettings) setSettings(savedSettings);
      setKept(ok);
      setPresets((current) => ({ ...savedPresets, ...current }));
      setRoster((current) => current ?? savedRoster);
      setEntries((current) => {
        if (current.length > 0) saveLogSoon.current = true;
        return mergeLoaded(saved, current);
      });
      const stopLog = opened.subscribe<Entry[]>(ROLL_LOG_KEY, (value) =>
        setEntries(cleanLog(value)),
      );
      const stopSettings = opened.subscribe<unknown>(SETTINGS_KEY, (value) => {
        setSettings(parseSettings(value));
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
    if (storage.current) void saveSettings(storage.current, next).catch(() => setKept(false));
  }

  function changeBackupState(next: BackupState) {
    setBackupState(next);
    if (storage.current) void storage.current.set(BACKUP_STATE_KEY, next).catch(() => {});
  }

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

  async function importBackup(backup: Backup) {
    if (!storage.current) throw new Error("no storage");
    await applyBackup(storage.current, backup);
    setRoster(backup.data.characters);
    setPresets(backup.data.globalPresets);
    setSettings(backup.data.settings);
    if (backup.data.rollLog !== undefined) setEntries(backup.data.rollLog);
    markBackedUp(backup);
  }

  async function addToData(incoming: Incoming, choices: Choices) {
    if (!storage.current) throw new Error("no storage");
    try {
      const result = await applyAdd(storage.current, incoming, choices);
      setRoster(result.roster);
      setPresets(result.globalPresets);
      return result;
    } catch (failure) {
      const current = storage.current;
      setRoster(await loadRoster(current).catch(() => cleanRoster(undefined)));
      setPresets(await loadPresets(current).catch(() => ({})));
      throw failure;
    }
  }

  function remember() {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function openDialog(mode: PresetDialogMode) {
    remember();
    setSideOpen(false);
    setDialog(mode);
  }

  function openCharacterDialog(mode: CharacterDialogMode) {
    remember();
    setSideOpen(false);
    setCharacterDialog(mode);
  }

  function openVariableDialog(mode: VariableDialogMode) {
    remember();
    setSideOpen(false);
    setVariableDialog(mode);
  }

  useEffect(() => {
    if (dialog !== null || characterDialog !== null || variableDialog !== null) return;
    const back = opener.current;
    opener.current = null;
    if (back === null) return;
    (back.isConnected ? back : input.current)?.focus();
  }, [dialog, characterDialog, variableDialog]);

  useEffect(() => {
    const at = pendingCaret.current;
    pendingCaret.current = null;
    if (at !== null) input.current?.setSelectionRange(at, at);
  }, [formula]);

  useEffect(() => {
    if (!focused) return;
    const follow = () => {
      if (document.activeElement === input.current) setCaret(input.current?.selectionStart ?? null);
    };
    document.addEventListener("selectionchange", follow);
    return () => document.removeEventListener("selectionchange", follow);
  }, [focused]);

  useEffect(() => {
    if (confirming && confirmFocus.current) {
      confirmFocus.current = false;
      confirmYes.current?.focus();
    }
  }, [confirming]);

  function changeFormula(next: string) {
    setHistoryNav(null);
    setFresh(false);
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

  function paletteFocus(): HTMLElement | null {
    if (handoff.current && document.activeElement instanceof HTMLElement) {
      return document.activeElement;
    }
    const back = paletteFrom.current;
    return back?.isConnected ? back : input.current;
  }

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
            handoff.current = true;
            globalThis.setTimeout(() => {
              setSettingsOpen(true);
            }, 250);
            return;
          case "clear-log":
            handoff.current = true;
            confirmFocus.current = true;
            setConfirming(true);
            return;
        }
    }
  }

  function startClear() {
    confirmFocus.current = true;
    setConfirming(true);
  }

  function clearLog() {
    setConfirming(false);
    setEntries([]);
    void storage.current?.delete(ROLL_LOG_KEY).catch(() => setKept(false));
    input.current?.focus();
  }

  function rollLine(text: string, from: RollSource = "preset") {
    const report = roll(text, dieSource(), {
      globalPresets: presets ?? {},
      character: acting ?? undefined,
    });
    if ("ok" in report) captureRoll(report.ok.rolls, from);
    saveLogSoon.current = true;
    setEntries((current) => addEntry(current, text, report));
    setRollCount((n) => n + 1);
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
    const recalled = historyNav !== null;
    setHistoryNav(null);
    if (text === "") return;
    rollLine(text, recalled ? "history" : "input");
    setFresh(true);
  }

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

  function focusLog(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    const items = log.current?.querySelectorAll<HTMLElement>('[role="treeitem"]');
    if (!items || items.length === 0) return;
    event.preventDefault();
    const current = log.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
    (current ?? items[items.length - 1])?.focus();
  }

  const panels = (
    <>
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
        onRoll={(name) => {
          setSideOpen(false);
          rollLine(name);
        }}
        onNew={() => openDialog({ kind: "new", formula: formula.trim() })}
        onEdit={(name, scope) => openDialog({ kind: "edit", name, scope })}
      />
    </>
  );
  const saveInMenu = !wide && (keypadOn || touch || small);
  const saveDisabled = presets === null || acting === null;

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl shrink-0 items-center gap-2 px-4 py-1 md:py-4">
        <span className="shrink-0">
          <img
            className="wordmark-light h-5 w-auto md:h-10"
            src="/rollin-wordmark-light.svg"
            alt=""
            width={263}
            height={51}
          />
          <img
            className="wordmark-dark h-5 w-auto md:h-10"
            src="/rollin-wordmark-dark.svg"
            alt=""
            width={263}
            height={51}
          />
        </span>
        <h1 className="sr-only">rollin</h1>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {!wide && (
            <Dialog open={sideOpen} onOpenChange={setSideOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={
                    acting === null ? "Characters and presets" : `Character: ${acting.name}`
                  }
                  className="max-w-40 min-w-0 justify-start"
                >
                  <span className="truncate font-mono">{acting?.name ?? "Characters"}</span>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="ml-auto size-4 text-muted-foreground"
                  />
                </Button>
              </DialogTrigger>
              <DialogContent
                {...swipe}
                className="touch-pan-y inset-y-0 left-0 flex w-slide-over max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto rounded-none border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 top-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle>Characters and presets</DialogTitle>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" size="sm">
                      Close
                    </Button>
                  </DialogClose>
                </div>
                <DialogDescription className="sr-only">
                  Switch character, edit variables, and roll saved presets.
                </DialogDescription>
                {panels}
              </DialogContent>
            </Dialog>
          )}
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
            onAdded={addToData}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />
        </div>
      </header>

      {update.available && (
        <div
          role="status"
          className="mx-auto mb-2 flex w-full max-w-5xl shrink-0 flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <span>A new version of rollin is ready.</span>
          <Button type="button" onClick={update.reload} size="sm">
            Reload to update
          </Button>
        </div>
      )}

      {reminderDue(backupState, Date.now()) && (
        <div
          role="status"
          className="mx-auto mb-2 flex w-full max-w-5xl shrink-0 flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <span>Your characters and presets live only in this browser. Save a backup file?</span>
          <Button type="button" onClick={() => void exportNow()} size="sm">
            Export backup
          </Button>
          <Button
            type="button"
            onClick={() => changeBackupState({ ...backupState, dismissedAt: Date.now() })}
            variant="outline"
            size="sm"
          >
            Not now
          </Button>
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 gap-8 px-4">
        {wide && (
          <div
            data-sidebar=""
            ref={sidebar}
            className="scroll-fade flex w-64 shrink-0 flex-col gap-6 overflow-y-auto pr-1 pb-4"
          >
            {panels}
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <RollLog
            entries={entries}
            treeRef={log}
            rollCount={rollCount}
            compact={saveInMenu}
            onEscape={() => input.current?.focus()}
            onClear={startClear}
            confirm={
              confirming && entries.length > 0 ? (
                <div
                  role="group"
                  aria-label="Confirm clear"
                  className="flex flex-wrap items-center gap-3 text-sm"
                >
                  <span>Clear the whole roll log?</span>
                  <Button type="button" ref={confirmYes} onClick={clearLog} size="sm">
                    Yes, clear
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setConfirming(false)}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              ) : null
            }
          />

          {!kept && (
            <p className="m-0 text-sm text-muted-foreground">
              Your browser is blocking storage, so the roll log, your presets and your settings
              won't be kept when you close or reload this page.
            </p>
          )}

          <div role="status" className="sr-only">
            {announcement}
          </div>
        </div>
      </div>

      {!wide && (
        <div className="mx-auto w-full max-w-5xl shrink-0 px-4">
          <PresetChips presets={available} onRoll={rollLine} />
        </div>
      )}

      <form onSubmit={submit} className="shrink-0 border-t border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-1 md:py-3">
          <div className="flex items-end gap-1 md:gap-2">
            <div className="relative flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="formula" className="max-md:sr-only">
                Formula
              </Label>
              <Input
                id="formula"
                value={formula}
                onChange={(event) => changeFormula(event.target.value)}
                placeholder="2d6+3"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus={!touch}
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
                className="font-mono"
              />
              {suggesting && (
                <CompletionList
                  id="formula-completions"
                  candidates={completion.candidates}
                  active={current}
                  onPick={pick}
                />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Keypad"
              aria-pressed={keypadOn}
              onClick={() => changeSettings({ ...settings, keypad: keypadOn ? "off" : "on" })}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            >
              <Grid3x3Icon aria-hidden="true" className="size-4" />
            </Button>
            {saveInMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label="More">
                    <EllipsisIcon aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="min-w-44">
                  <DropdownMenuItem
                    disabled={saveDisabled}
                    onSelect={() => openDialog({ kind: "new", formula: formula.trim() })}
                    className="max-md:min-h-11"
                  >
                    Save as preset
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={entries.length === 0} onSelect={startClear}>
                    Clear roll log
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!keypadOn && <Button type="submit">Roll</Button>}
            {!saveInMenu && (
              <Button
                type="button"
                variant="outline"
                disabled={saveDisabled}
                onClick={() => openDialog({ kind: "new", formula: formula.trim() })}
              >
                Save as preset
              </Button>
            )}
          </div>
          {keypadOn && (
            <Keypad
              formula={formula}
              fresh={fresh}
              onChange={changeFormula}
              onRoll={() => submit()}
            />
          )}
        </div>
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
