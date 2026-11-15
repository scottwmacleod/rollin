import { expect, type Page } from "@playwright/test";

export const log = (page: Page) => page.getByRole("tree", { name: "Roll log" });

/** Rolls `d20+<n>` one after another, so the log fills with distinct, findable entries. */
export async function rollMany(page: Page, count: number) {
  const field = page.getByLabel("Formula");
  for (let n = 1; n <= count; n++) {
    await field.fill(`d20+${n}`);
    await field.press("Enter");
  }
}

/** Saves `count` global presets straight into storage, then reloads so the app reads them. */
export async function seedPresets(page: Page, count: number) {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("rollin");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          const presets: Record<string, string> = {};
          for (let i = 1; i <= n; i++) presets[`preset${String(i).padStart(2, "0")}`] = `1d20+${i}`;
          tx.objectStore("kv").put(presets, "globalPresets");
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      }),
    count,
  );
  await page.reload();
}

/** The page itself never scrolls, in either direction. */
export async function expectNoPageScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    top: window.scrollY,
  }));
  expect(overflow.x).toBeLessThanOrEqual(0);
  expect(overflow.y).toBeLessThanOrEqual(0);
  expect(overflow.top).toBe(0);
}

/** The newest roll (found by its formula) is fully visible and clear of the formula bar. */
export async function expectNewestAboveFormulaBar(page: Page, formula: string) {
  const entry = log(page).getByText(formula, { exact: true }).last();
  await expect(entry).toBeVisible();
  const box = await entry.boundingBox();
  const bar = await page.locator("form").boundingBox();
  const frame = await log(page).boundingBox();
  expect(box).not.toBeNull();
  expect(bar).not.toBeNull();
  if (!box || !bar || !frame) return;
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
  expect(box.y).toBeGreaterThanOrEqual(0);
}
