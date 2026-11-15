import { openIndexedDbStorage } from "./indexeddb";
import { memoryStorage } from "./memory";
import type { Storage } from "./types";

export { memoryStorage } from "./memory";
export type { Storage } from "./types";

/** Real storage if the browser allows it; otherwise memory, with `kept: false` so the UI can say so. */
export async function openStorage(): Promise<{ storage: Storage; kept: boolean }> {
  try {
    return { storage: await openIndexedDbStorage(), kept: true };
  } catch {
    return { storage: memoryStorage(), kept: false };
  }
}
