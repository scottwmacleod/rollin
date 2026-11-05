import type { AboutView } from "../about";
import { statusText, type UpdateState, type Updater } from "./index";

/** The button the About dialog shows for a state; `null` hides it. */
function actionFor(state: UpdateState, updater: Updater): { label: string; run(): void } | null {
  switch (state.kind) {
    case "checking":
    case "installing":
      return null;
    case "available":
      return { label: "Update and restart", run: () => void updater.install() };
    case "failed":
      return state.version === undefined
        ? { label: "Check again", run: () => void updater.check() }
        : { label: "Try again", run: () => void updater.install() };
    case "idle":
    case "current":
      return { label: "Check for updates", run: () => void updater.check() };
  }
}

/** Shows the update state in the About dialog's status line and button. */
export function bindAboutToUpdater(about: AboutView, updater: Updater): void {
  updater.subscribe((state) => {
    about.setUpdateStatus(statusText(state));
    about.setUpdateAction(actionFor(state, updater));
  });
}
