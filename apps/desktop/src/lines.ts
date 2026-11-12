import type { Execution } from "./api/generated";
import type { SessionStore } from "./store";

export interface LineDeps {
  /** Runs a line in the Session (`api.execute`). */
  execute(line: string): Promise<Execution>;
  store: SessionStore;
}

export interface Lines {
  /** Records a line that has already run (the formula box runs its own). */
  record(line: string, execution: Execution): Promise<void>;
  /** Runs a line that did not come from the box (preset click, ⌘1–9, reroll) and records it. */
  run(line: string): Promise<void>;
  /** Calls `listener` for every recorded line, before the state is refreshed. */
  onRecord(listener: (line: string, execution: Execution) => void): void;
}

/** The one way a line reaches the views: the log and the top bar hear it, then
 * the store reads the Session once, because `save`, `set`, `char` and friends
 * change what every view shows. */
export function createLines({ execute, store }: LineDeps): Lines {
  const listeners: ((line: string, execution: Execution) => void)[] = [];

  async function record(line: string, execution: Execution): Promise<void> {
    for (const listener of listeners) listener(line, execution);
    await store.refresh();
  }

  return {
    record,
    async run(line) {
      let execution: Execution;
      try {
        execution = await execute(line);
      } catch (failure) {
        const message = (failure as { message?: unknown } | null)?.message;
        execution = { status: "rejected", message: typeof message === "string" ? message : String(failure) };
      }
      await record(line, execution);
    },
    onRecord: (listener) => void listeners.push(listener),
  };
}
