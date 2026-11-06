import type { Updater } from "./index";

export const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const FOCUS_RECHECK_AFTER_MS = 60 * 60 * 1000;

interface ScheduleOptions {
  intervalMs?: number;
  focusAfterMs?: number;
  now?: () => number;
  target?: Pick<Window, "addEventListener">;
}

/**
 * Keeps an open app current: a silent check every few hours, plus one when
 * the window regains focus after a long gap (e.g. the Mac woke from sleep).
 * Finding an update only raises the banner; nothing installs by itself.
 * Returns a function that stops the schedule.
 */
export function startUpdateSchedule(updater: Updater, options: ScheduleOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? RECHECK_INTERVAL_MS;
  const focusAfterMs = options.focusAfterMs ?? FOCUS_RECHECK_AFTER_MS;
  const now = options.now ?? Date.now;
  const target = options.target ?? window;
  let lastCheck = now();

  const run = () => {
    lastCheck = now();
    void updater.check({ background: true });
  };
  const timer = setInterval(run, intervalMs);
  const onFocus = () => {
    if (now() - lastCheck >= focusAfterMs) run();
  };
  target.addEventListener("focus", onFocus);
  return () => {
    clearInterval(timer);
    (target as Window).removeEventListener?.("focus", onFocus);
  };
}
