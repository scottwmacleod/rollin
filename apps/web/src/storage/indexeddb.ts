import type { Storage } from "./types";

const STORE = "kv";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function openIndexedDbStorage(name = "rollin"): Promise<Storage> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await request(open);
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(name);

  const write = async (apply: (store: IDBObjectStore) => void) => {
    const tx = db.transaction(STORE, "readwrite");
    apply(tx.objectStore(STORE));
    await done(tx);
  };

  return {
    get: async <T>(key: string) =>
      (await request(db.transaction(STORE).objectStore(STORE).get(key))) as T | undefined,
    async set(key, value) {
      await write((store) => store.put(value, key));
      channel?.postMessage({ key, value });
    },
    async delete(key) {
      await write((store) => store.delete(key));
      channel?.postMessage({ key, value: undefined });
    },
    subscribe<T>(key: string, listener: (value: T | undefined) => void) {
      if (!channel) return () => {};
      const onMessage = (event: MessageEvent<{ key: string; value: T | undefined }>) => {
        if (event.data.key === key) listener(event.data.value);
      };
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
  };
}
