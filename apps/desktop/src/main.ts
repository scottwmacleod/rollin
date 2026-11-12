import "./generated/tokens.css";
import "./fonts.css";
import "./app.css";
import { trackFullscreen } from "./fullscreen";
import { initTheme } from "./theme";

initTheme();
document.documentElement.dataset.platform = /Mac/.test(navigator.userAgent) ? "macos" : "other";
void trackFullscreen(document.documentElement);

import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { about, check, edit, execute, relaunch, sample, setSystem, state } from "./api";
import { mountAbout } from "./about";
import { mountChrome } from "./chrome";
import { createLines } from "./lines";
import { mountInput } from "./input";
import { mountLog, type LogEntry } from "./log";
import { entryFor } from "./session";
import { mountSidebar } from "./sidebar";
import { createStore } from "./store";
import { mountSlideOverDismiss } from "./sidebar/dismiss";
import { createUpdater } from "./updater";
import { bindAboutToUpdater } from "./updater/about";
import { mountUpdateBanner } from "./updater/banner";
import { startUpdateSchedule } from "./updater/schedule";

function must(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`index.html has no ${selector}`);
  return found;
}

// The Session's saved data lives in one store; every line goes through `lines`.
const store = createStore(state);
const lines = createLines({ execute, store });

const input = mountInput(must(".formula-box"), { onSubmit: lines.record });
const log = mountLog(must(".roll-log"), {
  focusInput: () => input.focus(),
  reroll: (entry: LogEntry) => void lines.run(entry.input),
});
log.bindInput(must(".formula-box"));
input.focus();

// A preset click and typing its name give the same log entry.
const sidebarEl = must(".sidebar");
const sidebar = mountSidebar(sidebarEl, { edit, store, run: (line) => void lines.run(line) });
const appEl = document.getElementById("app");
if (appEl) mountSlideOverDismiss(appEl, sidebarEl);

const chrome = mountChrome(must(".toolbar"), must(".status-bar"), {
  edit,
  store,
  setSystem,
  check,
  sample,
  about,
  run: (line) => void lines.run(line),
  toggleSidebar: () => sidebar.toggle(),
});

lines.onRecord((line, execution) => {
  const entry = entryFor(line, execution);
  if (entry) log.append(entry);
  chrome.note(execution);
});

void store.refresh();

// `Rollin ▸ About Rollin` (and its shortcut) is a native menu item; it sends
// this event. Auto-update reports in the dialog and in a banner on launch.
export const aboutView = mountAbout({ about, openUrl });
void listen("about:open", () => void aboutView.open());

const updater = createUpdater({ check: checkForUpdate, relaunch });
bindAboutToUpdater(aboutView, updater);
// The logo cursor blinks fast while an update is being checked or installed.
updater.subscribe((state) => chrome.setBusy(state.kind === "checking" || state.kind === "installing"));
mountUpdateBanner(updater);
void updater.check();
startUpdateSchedule(updater);
