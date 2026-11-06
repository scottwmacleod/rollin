import "./generated/tokens.css";
import "./fonts.css";
import "./app.css";
import { initTheme } from "./theme";

initTheme();
document.documentElement.dataset.platform = /Mac/.test(navigator.userAgent) ? "macos" : "other";

import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { about, check, execute, relaunch, setSeed, state } from "./api";
import { mountAbout } from "./about";
import { mountChrome } from "./chrome";
import type { Execution } from "./api";
import { mountInput } from "./input";
import { mountLog, type LogEntry } from "./log";
import { entryFor } from "./session";
import { mountSidebar } from "./sidebar";
import { mountSidebarToggle } from "./sidebar/toggle";
import { createUpdater } from "./updater";
import { bindAboutToUpdater } from "./updater/about";
import { mountUpdateBanner } from "./updater/banner";
import { startUpdateSchedule } from "./updater/schedule";

const logEl = document.querySelector<HTMLElement>(".roll-log");
const inputEl = document.querySelector<HTMLElement>(".formula-box");
const sidebarEl = document.querySelector<HTMLElement>(".sidebar");
const toolbarEl = document.querySelector<HTMLElement>(".toolbar");
const statusEl = document.querySelector<HTMLElement>(".status-bar");

let sidebar: ReturnType<typeof mountSidebar> | null = null;
let input: ReturnType<typeof mountInput> | null = null;
let chrome: ReturnType<typeof mountChrome> | null = null;

// One way into the log: every line, typed or not, ends up here.
function record(line: string, execution: Execution): void {
  const entry = entryFor(line, execution);
  if (entry) log?.append(entry);
  // `save`, `set`, `char` and friends change what the sidebar shows.
  void sidebar?.refresh();
  void chrome?.record(execution);
}

/** Runs a line that did not come from the box (preset click, ⌘1–9, reroll). */
async function run(line: string): Promise<void> {
  try {
    record(line, await execute(line));
  } catch (failure) {
    const message = (failure as { message?: unknown } | null)?.message;
    record(line, { status: "rejected", message: typeof message === "string" ? message : String(failure) });
  }
}

const log = logEl
  ? mountLog(logEl, {
      focusInput: () => input?.focus(),
      reroll: (entry: LogEntry) => void run(entry.input),
    })
  : null;

if (inputEl) {
  input = mountInput(inputEl, { onSubmit: record });
  if (logEl) log?.bindInput(inputEl);
  input.focus();
}

if (sidebarEl) {
  // A preset click and typing its name give the same log entry.
  sidebar = mountSidebar(sidebarEl, {
    execute,
    state,
    run: (line) => window.dispatchEvent(new CustomEvent("rollin:submit", { detail: line })),
  });
  const appEl = document.getElementById("app");
  const toolbarEl = document.querySelector<HTMLElement>(".toolbar");
  if (appEl && toolbarEl) mountSidebarToggle(appEl, toolbarEl, sidebarEl, sidebar.toggle);
}

if (toolbarEl && statusEl) {
  chrome = mountChrome(toolbarEl, statusEl, {
    execute,
    state,
    setSeed,
    check,
    about,
    run: (line) => void run(line),
    toggleSidebar: () => sidebar?.toggle(),
    clearLog: () => log?.clear(),
    changed: () => void sidebar?.refresh(),
  });
}

window.addEventListener("rollin:submit", (e) => {
  const line = (e as CustomEvent<unknown>).detail;
  if (typeof line === "string" && line.trim() !== "") void run(line);
});

// `Rollin ▸ About Rollin` (and its shortcut) is a native menu item; it sends
// this event. Auto-update reports in the dialog and in a banner on launch.
export const aboutView = mountAbout({ about, openUrl });
void listen("about:open", () => void aboutView.open());

const updater = createUpdater({ check: checkForUpdate, relaunch });
bindAboutToUpdater(aboutView, updater);
mountUpdateBanner(updater);
void updater.check();
startUpdateSchedule(updater);
