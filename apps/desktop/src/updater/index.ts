/** What the updater plugin hands back for a newer release. */
export interface PendingUpdate {
  version: string;
  /** Downloads, verifies the signature and installs. Rejects on any failure. */
  downloadAndInstall(): Promise<void>;
}

export interface UpdaterDeps {
  /** Asks the release endpoint; `null` means this build is the newest. */
  check(): Promise<PendingUpdate | null>;
  /** Restarts the app into the installed update. */
  relaunch(): Promise<void>;
}

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; version: string }
  | { kind: "installing"; version: string }
  /** `version` is set when an install failed, so it can be retried. */
  | { kind: "failed"; message: string; version?: string };

export interface Updater {
  state(): UpdateState;
  /** Calls `listener` now and on every change; returns an unsubscribe. */
  subscribe(listener: (state: UpdateState) => void): () => void;
  /**
   * Checks for an update. Does nothing while a check or install runs.
   * A `background` check is silent: it shows no "checking" state, keeps an
   * offered update on screen, and ignores failures.
   */
  check(options?: { background?: boolean }): Promise<void>;
  /** Installs the update found by `check`, then restarts. */
  install(): Promise<void>;
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(error);
}

/** The line the About dialog shows for a state; `null` hides it. */
export function statusText(state: UpdateState): string | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "checking":
      return "Checking for updates…";
    case "current":
      return "Up to date";
    case "available":
      return `Version ${state.version} is available`;
    case "installing":
      return `Installing version ${state.version}…`;
    case "failed":
      return state.version === undefined
        ? `Could not check for updates: ${state.message}`
        : `Update to ${state.version} failed: ${state.message}. This version still works.`;
  }
}

/**
 * The update flow as a small state machine, so the About dialog and the
 * launch banner show the same thing. A failure never throws: it becomes
 * state, and the installed app keeps running.
 */
export function createUpdater(deps: UpdaterDeps): Updater {
  let state: UpdateState = { kind: "idle" };
  let pending: PendingUpdate | null = null;
  const listeners = new Set<(state: UpdateState) => void>();

  const set = (next: UpdateState) => {
    state = next;
    for (const listener of [...listeners]) listener(state);
  };

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    async check(options) {
      if (state.kind === "checking" || state.kind === "installing") return;
      const quiet = options?.background === true;
      if (!quiet) set({ kind: "checking" });
      const before = state;
      try {
        const found = await deps.check();
        // An install may have started while this check was in flight.
        if ((state as UpdateState).kind === "installing") return;
        if (quiet && found === null && before.kind === "available") return;
        pending = found;
        if (quiet && found && before.kind === "available" && before.version === found.version) return;
        set(found ? { kind: "available", version: found.version } : { kind: "current" });
      } catch (error) {
        if (quiet) return;
        pending = null;
        set({ kind: "failed", message: messageOf(error) });
      }
    },
    async install() {
      const update = pending;
      if (!update || state.kind === "checking" || state.kind === "installing") return;
      set({ kind: "installing", version: update.version });
      try {
        await update.downloadAndInstall();
      } catch (error) {
        set({ kind: "failed", message: messageOf(error), version: update.version });
        return;
      }
      try {
        await deps.relaunch();
      } catch (error) {
        // Installed, but the app could not restart itself.
        pending = null;
        set({
          kind: "failed",
          message: `${messageOf(error)}. Quit and reopen Rollin to finish`,
          version: update.version,
        });
      }
    },
  };
}
