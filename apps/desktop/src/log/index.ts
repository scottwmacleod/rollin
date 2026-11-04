import "./log.css";
import { renderEntry } from "./entry";
import type { LogEntry } from "./types";

export type { LogEntry } from "./types";
export { renderEntry } from "./entry";

export interface RollLog {
  /** Adds an entry at the bottom and scrolls to it. */
  append(entry: LogEntry): void;
  clear(): void;
  setCompact(compact: boolean): void;
}

/** Turns `container` into the roll log: an `aria-live` region whose newest
 * entry sits at the bottom, just above the formula box. */
export function mountLog(container: HTMLElement): RollLog {
  container.classList.add("roll-log-region");
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-relevant", "additions");
  const list = document.createElement("div");
  list.className = "log-entries";
  container.replaceChildren(list);

  return {
    append(entry) {
      list.append(renderEntry(entry, true));
      container.scrollTop = container.scrollHeight;
    },
    clear() {
      list.replaceChildren();
    },
    setCompact(compact) {
      container.toggleAttribute("data-compact", compact);
    },
  };
}
