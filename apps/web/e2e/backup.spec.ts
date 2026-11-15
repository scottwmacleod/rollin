import { readFileSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Presets" });
const characters = (page: Page) => page.getByRole("complementary", { name: "Characters" });

async function seed(page: Page) {
  await page.getByRole("button", { name: "New preset" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Fireball");
  await dialog.getByLabel("Formula").fill("8d6");
  await dialog.getByLabel("Every character").check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "New character" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Aria");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "New variable" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("str");
  await dialog.getByLabel("Value").fill("3");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** Empties the saved data the way "clear site data" would. */
async function clearStorage(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("rollin");
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").clear();
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      }),
  );
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: /Settings/ }).click();
  return page.getByRole("dialog");
}

test("export, clear storage, import: the same characters and presets come back", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await seed(page);
  await expect(sidebar(page)).toContainText("fireball");

  const dialog = await openSettings(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export backup" }).click();
  const file = testInfo.outputPath("backup.json");
  await (await download).saveAs(file);
  const saved = JSON.parse(readFileSync(file, "utf8"));
  expect(saved).toMatchObject({ format: "rollin-backup", version: 1 });
  expect(saved.data.rollLog).toBeUndefined();

  await clearStorage(page);
  await page.reload();
  await expect(sidebar(page)).toContainText("No presets yet");

  const again = await openSettings(page);
  await again.getByLabel("Backup file").setInputFiles(file);
  await expect(again).toContainText("2 characters, 1 variable");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await again.getByRole("button", { name: "Replace my data" }).click();
  await expect(again).toContainText("Imported");
  await again.getByRole("button", { name: "Done" }).click();

  await expect(sidebar(page)).toContainText("fireball");
  await expect(characters(page).getByRole("button", { name: /^aria/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("complementary", { name: /^Variables/ })).toContainText("@str");

  // It was saved, not just shown.
  await page.reload();
  await expect(sidebar(page)).toContainText("fireball");
  await expect(page.getByRole("complementary", { name: /^Variables/ })).toContainText("@str");
});

test("a malformed or newer file is refused and nothing changes", async ({ page }, testInfo) => {
  await page.goto("/");
  await seed(page);
  const dialog = await openSettings(page);

  const bad = testInfo.outputPath("bad.json");
  writeFileSync(bad, "{nope");
  await dialog.getByLabel("Backup file").setInputFiles(bad);
  await expect(dialog.getByRole("status")).toContainText("isn't valid JSON");

  const newer = testInfo.outputPath("newer.json");
  writeFileSync(newer, JSON.stringify({ format: "rollin-backup", version: 99, data: {} }));
  await dialog.getByLabel("Backup file").setInputFiles(newer);
  await expect(dialog.getByRole("status")).toContainText("newer rollin");
  await expect(dialog.getByRole("button", { name: "Replace my data" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(sidebar(page)).toContainText("fireball");
});

test("the backup reminder shows for old unsaved data and can be dismissed", async ({ page }) => {
  await page.goto("/");
  await seed(page);
  await expect(page.getByText("Save a backup file?")).toHaveCount(0);

  // Pretend the unsaved data has been waiting a week.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open("rollin");
            open.onsuccess = () => {
              const tx = open.result.transaction("kv", "readwrite");
              tx.objectStore("kv").put(
                { unsavedSince: Date.now() - 7 * 86_400_000 },
                "backupState",
              );
              tx.oncomplete = () => {
                open.result.close();
                resolve(true);
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  const reminder = page.getByText("Save a backup file?");
  await expect(reminder).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(reminder).toHaveCount(0);
  await page.reload();
  await expect(reminder).toHaveCount(0);
});
