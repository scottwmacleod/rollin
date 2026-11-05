import "./generated/tokens.css";
import "./fonts.css";
import "./app.css";
import { initTheme } from "./theme";

initTheme();

import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { about, execute, state } from "./api";
import { mountAbout } from "./about";
import type { Execution } from "./api";
import { mountInput } from "./input";
import { mountLog, type LogEntry } from "./log";
import { entryFor } from "./session";
import { mountSidebar } from "./sidebar";
import { createUpdater } from "./updater";
import { bindAboutToUpdater } from "./updater/about";
import { mountUpdateBanner } from "./updater/banner";

const logEl = document.querySelector<HTMLElement>(".roll-log");
const inputEl = document.querySelector<HTMLElement>(".formula-box");
const sidebarEl = document.querySelector<HTMLElement>(".sidebar");

let sidebar: ReturnType<typeof mountSidebar> | null = null;
let input: ReturnType<typeof mountInput> | null = null;

// One way into the log: every line, typed or not, ends up here.
function record(line: string, execution: Execution): void {
  const entry = entryFor(line, execution);
  if (entry) log?.append(entry);
  // `save`, `set`, `char` and friends change what the sidebar shows.
  void sidebar?.refresh();
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
