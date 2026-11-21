import { afterEach, describe, expect, it, vi } from "vitest";

import { openIndexedDbStorage } from "./indexeddb";

type Handler = (() => void) | null;

function stubOpen(fail: boolean) {
  const tx = {
    error: null,
    oncomplete: null as Handler,
    onerror: null as Handler,
    onabort: null as Handler,
    objectStore: () => ({ put: () => {} }),
  };
  const db = { transaction: () => tx };
  const open = {
    result: db,
    error: null,
    onsuccess: null as Handler,
    onerror: null as Handler,
    onupgradeneeded: null as Handler,
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      queueMicrotask(() => (fail ? open.onerror?.() : open.onsuccess?.()));
      return open;
    },
  });
  vi.stubGlobal("BroadcastChannel", undefined);
  return tx;
}

describe("openIndexedDbStorage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects with an Error when a request fails without one", async () => {
    stubOpen(true);
    await expect(openIndexedDbStorage()).rejects.toEqual(new Error("IndexedDB request failed"));
  });

  it("rejects with an Error when a transaction aborts without one", async () => {
    const tx = stubOpen(false);
    const storage = await openIndexedDbStorage();
    const pending = storage.set("key", 1);
    tx.onabort?.();
    await expect(pending).rejects.toEqual(new Error("IndexedDB transaction aborted"));
  });
});
