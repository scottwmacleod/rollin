import type { SessionState } from "./api/generated";

/** The one owner of the Session's saved data as the views see it: Characters,
 * Variables, Presets, Game system and seed. The sidebar, the top bar and the
 * palette read it here and never keep a copy. Whatever changes saved data
 * calls `refresh` once; every view hears about it. */
export interface SessionStore {
  /** The last state read, or null before the first read and after a failed one. */
  readonly state: SessionState | null;
  /** Why the last read failed; empty when it did not. */
  readonly error: string;
  /** Reads the state once and tells every subscriber. */
  refresh(): Promise<void>;
  /** Calls `listener` after every refresh. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

export function createStore(read: () => Promise<SessionState>): SessionStore {
  let state: SessionState | null = null;
  let error = "";
  let latest = 0;
  const listeners = new Set<() => void>();

  return {
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    async refresh() {
      const mine = ++latest;
      let next: SessionState | null = null;
      let failure = "";
      try {
        next = await read();
      } catch (e) {
        failure = (e as { error?: { message?: string } } | null)?.error?.message ?? "Could not read saved data.";
      }
      // A newer read is in flight: it will report, and this one is stale.
      if (mine !== latest) return;
      state = next;
      error = failure;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
