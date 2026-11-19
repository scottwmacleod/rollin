import type { Page } from "@playwright/test";

/** A value the app saved, read straight from its IndexedDB store; undefined when nothing is saved. */
export function stored(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (k) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("rollin");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("kv")) {
            db.close();
            resolve(undefined);
            return;
          }
          const get = db.transaction("kv").objectStore("kv").get(k);
          get.onsuccess = () => {
            db.close();
            resolve(get.result);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    key,
  );
}

/** The inputs of the saved roll log, oldest first, for waiting until a roll is saved before a reload. */
export async function savedRolls(page: Page): Promise<string[]> {
  const log = await stored(page, "rollLog");
  return Array.isArray(log) ? log.map((entry: { input: string }) => entry.input) : [];
}
