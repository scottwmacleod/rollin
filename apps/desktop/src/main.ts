import "./generated/tokens.css";
import "./fonts.css";
import "./app.css";
import { initTheme } from "./theme";

initTheme();

import { execute, state } from "./api";
import type { Execution } from "./api";
import { mountInput } from "./input";
import { mountLog, type LogEntry } from "./log";
import { entryFor } from "./session";
import { mountSidebar } from "./sidebar";

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
