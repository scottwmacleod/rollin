import type { Page } from "@playwright/test";

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
