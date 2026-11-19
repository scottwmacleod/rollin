import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * Waits for the page's motion to finish. A roll fades in and a pressed control
 * springs back, so a check made mid-way reads a part-faded colour or a
 * part-scaled size that a player never sees at rest. Endless animations (the
 * cursor blink) are left alone.
 */
export async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/** Runs axe once the page's motion has finished (see `settled`). */
export async function axe(page: Page) {
  await settled(page);
  return new AxeBuilder({ page }).analyze();
}

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
