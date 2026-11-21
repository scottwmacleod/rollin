import type { Storage } from "./types";

export function memoryStorage(): Storage {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
    subscribe: () => () => {},
  };
}
