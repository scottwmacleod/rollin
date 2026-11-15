/**
 * The app's one door to saved data. Values are keyed by name ("rollLog" now;
 * characters, presets and settings later) and must be structured-cloneable.
 * Keeping it this small lets a sync backend slot in behind it one day.
 */
export interface Storage {
  /** The saved value, or `undefined` if nothing has been saved under `key`. */
  get<T>(key: string): Promise<T | undefined>;
  /** Replace the value under `key`. The latest save wins, in every open tab. */
  set<T>(key: string, value: T): Promise<void>;
  /** Remove `key`. */
  delete(key: string): Promise<void>;
  /**
   * Call `listener` when another tab saves or deletes `key`, with the new value
   * (`undefined` after a delete). Never fires for this tab's own writes.
   * Returns the unsubscribe function.
   */
  subscribe<T>(key: string, listener: (value: T | undefined) => void): () => void;
}
