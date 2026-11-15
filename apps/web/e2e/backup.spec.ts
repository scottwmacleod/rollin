import { readFileSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo, test } from "@playwright/test";

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
  expect(saved).toMatchObject({ format: "rollin-backup", version: 2, kind: "full" });
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

test("a partial file shows its summary, offers no replace and says why", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await seed(page);
  const dialog = await openSettings(page);

  const partial = testInfo.outputPath("partial.json");
  writeFileSync(
    partial,
    JSON.stringify({
      format: "rollin-backup",
      version: 2,
      kind: "partial",
      data: {
        characters: { characters: [{ name: "Borin", vars: { str: 4 }, presets: {} }] },
        globalPresets: { smite: "2d8" },
      },
    }),
  );
  await dialog.getByLabel("Backup file").setInputFiles(partial);
  const info = dialog.getByRole("group", { name: "Partial file" });
  await expect(info).toContainText("1 character, 1 variable, 0 character presets, 1 global preset");
  await expect(info).toContainText("Replace needs a full backup");
  await expect(dialog.getByRole("status")).toContainText("You can add it to your data");
  await expect(dialog.getByRole("button", { name: "Replace my data" })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await info.getByRole("button", { name: "Close" }).click();
  await expect(info).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Import backup…" })).toBeFocused();
  await dialog.getByLabel("Backup file").setInputFiles(partial);
  await expect(info).toBeVisible();

  const empty = testInfo.outputPath("empty.json");
  writeFileSync(
    empty,
    JSON.stringify({ format: "rollin-backup", version: 2, kind: "partial", data: {} }),
  );
  await dialog.getByLabel("Backup file").setInputFiles(empty);
  await expect(dialog.getByRole("status")).toContainText("nothing to read");
  await expect(info).toHaveCount(0);

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(sidebar(page)).toContainText("fireball");
});

/** Writes a partial file and picks it in the open settings dialog. */
async function pickPartial(
  page: Page,
  testInfo: TestInfo,
  data: { characters?: unknown[]; globalPresets?: Record<string, string> },
) {
  const file = testInfo.outputPath("add.json");
  writeFileSync(
    file,
    JSON.stringify({
      format: "rollin-backup",
      version: 2,
      kind: "partial",
      data: {
        ...(data.characters ? { characters: { characters: data.characters } } : {}),
        ...(data.globalPresets ? { globalPresets: data.globalPresets } : {}),
      },
    }),
  );
  const dialog = await openSettings(page);
  await dialog.getByLabel("Backup file").setInputFiles(file);
  return dialog;
}

const clashing = {
  characters: [{ name: "aria", vars: { str: 9 }, presets: {} }],
  globalPresets: { fireball: "10d6" },
};

test("add: a partial file with new names comes in and nothing else changes", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await seed(page);
  const dialog = await pickPartial(page, testInfo, {
    characters: [{ name: "borin", vars: { str: 4 }, presets: {} }],
    globalPresets: { smite: "2d8" },
  });
  await dialog.getByRole("button", { name: "Add to my data" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Added 1 character and 1 global preset.");
  await expect(dialog.getByRole("button", { name: "Import backup…" })).toBeFocused();
  await dialog.getByRole("button", { name: "Done" }).click();

  await expect(sidebar(page)).toContainText("smite");
  await expect(sidebar(page)).toContainText("fireball");
  await expect(characters(page).getByRole("button", { name: /^borin/ })).toBeVisible();
  await expect(characters(page).getByRole("button", { name: /^aria/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(sidebar(page)).toContainText("smite");
  await expect(characters(page).getByRole("button", { name: /^borin/ })).toBeVisible();
});

test("add: a full backup offers add and replace", async ({ page }, testInfo) => {
  await page.goto("/");
  await seed(page);
  const dialog = await openSettings(page);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export backup" }).click();
  const file = testInfo.outputPath("full.json");
  await (await download).saveAs(file);
  await dialog.getByLabel("Backup file").setInputFiles(file);
  await expect(dialog.getByRole("button", { name: "Add to my data" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Replace my data" })).toBeVisible();
  // The same data is not a clash: nothing to ask, nothing to add.
  await dialog.getByRole("button", { name: "Add to my data" }).click();
  await expect(dialog.getByRole("status")).toContainText("Nothing to add");
});

for (const [choice, summary] of [
  ["Keep mine", "Kept 2 of yours."],
  ["Take the file's", "Replaced 1 character and 1 global preset with the file's."],
  ["Keep both", "Added 1 character and 1 global preset (2 under a new name)."],
] as const) {
  test(`add: a clash with "${choice}"`, async ({ page }, testInfo) => {
    await page.goto("/");
    await seed(page);
    const dialog = await pickPartial(page, testInfo, clashing);
    await dialog.getByRole("button", { name: "Add to my data" }).click();

    const first = dialog.getByRole("group", { name: "You already have a character called aria." });
    await expect(first).toBeVisible();
    await expect(first.getByRole("button", { name: "Keep mine" })).toBeFocused();
    await first.getByRole("button", { name: choice, exact: true }).click();

    const second = dialog.getByRole("group", {
      name: "You already have a global preset called fireball.",
    });
    await expect(second).toBeVisible();
    await expect(second.getByRole("button", { name: "Keep mine" })).toBeFocused();
    await second.getByRole("button", { name: choice, exact: true }).click();

    await expect(dialog.getByRole("status")).toHaveText(summary);
    await expect(dialog.getByRole("button", { name: "Import backup…" })).toBeFocused();
    await dialog.getByRole("button", { name: "Done" }).click();

    const roster = characters(page);
    const presets = sidebar(page);
    if (choice === "Keep both") {
      await expect(roster.getByRole("button", { name: /^aria-2/ })).toBeVisible();
      await expect(presets).toContainText("fireball-2");
      await expect(presets).toContainText("10d6");
      await expect(presets).toContainText("8d6");
    } else if (choice === "Take the file's") {
      await expect(presets).toContainText("10d6");
      await expect(presets).not.toContainText("8d6");
      await expect(page.getByRole("complementary", { name: /^Variables/ })).toContainText("9");
    } else {
      await expect(presets).toContainText("8d6");
      await expect(presets).not.toContainText("10d6");
      await expect(page.getByRole("complementary", { name: /^Variables/ })).toContainText("3");
    }
    await page.reload();
    await expect(characters(page).getByRole("button", { name: /^aria/ }).first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
}

test("add: same for all applies to the rest of that kind only", async ({ page }, testInfo) => {
  await page.goto("/");
  await seed(page);
  const dialog = await pickPartial(page, testInfo, {
    characters: [
      { name: "aria", vars: { str: 9 }, presets: {} },
      { name: "default", vars: { dex: 1 }, presets: {} },
    ],
    globalPresets: { fireball: "10d6" },
  });
  await dialog.getByRole("button", { name: "Add to my data" }).click();
  const first = dialog.getByRole("group", { name: "You already have a character called aria." });
  await first.getByLabel("Do the same for the other 1 character").check();
  await first.getByRole("button", { name: "Keep both" }).click();
  // The other character is settled, so the next question is about the preset.
  const preset = dialog.getByRole("group", {
    name: "You already have a global preset called fireball.",
  });
  await expect(preset).toBeVisible();
  await expect(preset.getByLabel(/Do the same/)).toHaveCount(0);
  await preset.getByRole("button", { name: "Keep mine" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Added 2 characters (2 under a new name); kept 1 of yours.",
  );
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(characters(page).getByRole("button", { name: /^aria-2/ })).toBeVisible();
  await expect(characters(page).getByRole("button", { name: /^default-2/ })).toBeVisible();
});

test("add: cancelling part way changes nothing", async ({ page }, testInfo) => {
  await page.goto("/");
  await seed(page);
  const dialog = await pickPartial(page, testInfo, {
    ...clashing,
    characters: [...clashing.characters, { name: "borin", vars: {}, presets: {} }],
  });
  await dialog.getByRole("button", { name: "Add to my data" }).click();
  await dialog.getByRole("button", { name: "Take the file's" }).click();
  await expect(dialog.getByRole("group", { name: /global preset called fireball/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByRole("status")).toContainText("Nothing was changed");
  await expect(dialog.getByRole("button", { name: "Import backup…" })).toBeFocused();
  await dialog.getByRole("button", { name: "Done" }).click();

  const check = async () => {
    await expect(sidebar(page)).toContainText("8d6");
    await expect(sidebar(page)).not.toContainText("10d6");
    await expect(characters(page).getByRole("button", { name: /^borin/ })).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: /^Variables/ })).toContainText("3");
  };
  await check();
  await page.reload();
  await check();
});

test("add: the clash prompt passes axe and has touch-sized controls on a phone", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await seed(page);
  // The sidebar is a slide-over at this width, so seed at full width and then narrow the window.
  await page.setViewportSize({ width: 375, height: 700 });
  const dialog = await pickPartial(page, testInfo, {
    characters: [
      { name: "aria", vars: { str: 9 }, presets: {} },
      { name: "default", vars: { dex: 1 }, presets: {} },
    ],
  });
  await dialog.getByRole("button", { name: "Add to my data" }).click();
  const prompt = dialog.getByRole("group", { name: /You already have a character/ });
  await expect(prompt).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(dialog.getByRole("button", { name: "Import backup…" })).toBeDisabled();
  const label = await prompt.getByText(/Do the same for the other/).boundingBox();
  expect(label?.height).toBeGreaterThanOrEqual(44);
  for (const name of ["Keep mine", "Take the file's", "Keep both", "Cancel"]) {
    const box = await prompt.getByRole("button", { name, exact: true }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
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

test("settings credits its maker with a link", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/ }).click();
  const link = page.getByRole("dialog").getByRole("link", { name: "Scott MacLeod" });
  await expect(link).toHaveAttribute("href", "https://scottmacleod.co");
  await expect(page.getByRole("dialog")).toContainText("Built by");
});

test("export one character, clear storage, add the file: it rolls the same", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [
        { sides: 20, face: 19 },
        { sides: 8, face: 2 },
        { sides: 8, face: 5 },
      ],
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "New character" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Export" })).toHaveCount(0);
  await dialog.getByLabel("Name").fill("Grog");
  await dialog.getByLabel("Game system").selectOption("dnd5e");
  await dialog.getByLabel("Crit range").fill("19");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "New variable" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("str");
  await dialog.getByLabel("Value").fill("5");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "New preset" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("atk");
  await dialog.getByLabel("Formula").fill("d20+@str, 1d8+3");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Edit grog" }).click();
  dialog = page.getByRole("dialog");
  // The export is of the saved character, not of what is typed here.
  await dialog.getByLabel("Name").fill("unsaved");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  const got = await download;
  expect(got.suggestedFilename()).toMatch(/^rollin-character-grog-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(dialog.getByRole("status")).toHaveText("Exported grog.");
  await expect(dialog.getByRole("button", { name: "Export" })).toBeFocused();
  const file = testInfo.outputPath("grog.json");
  await got.saveAs(file);
  const saved = JSON.parse(readFileSync(file, "utf8"));
  expect(saved).toMatchObject({ format: "rollin-backup", version: 2, kind: "partial" });
  expect(saved.data.globalPresets).toBeUndefined();
  expect(saved.data.characters.active).toBeUndefined();
  expect(saved.data.characters.characters).toEqual([
    {
      name: "grog",
      vars: { str: 5 },
      presets: { atk: "d20+@str, 1d8+3" },
      system: "dnd5e",
      critRange: 19,
    },
  ]);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await clearStorage(page);
  await page.reload();
  await expect(sidebar(page)).toContainText("No presets yet");

  const settings = await openSettings(page);
  await settings.getByLabel("Backup file").setInputFiles(file);
  await expect(settings.getByRole("button", { name: "Replace my data" })).toHaveCount(0);
  await settings.getByRole("button", { name: "Add to my data" }).click();
  await expect(settings.getByRole("status")).toHaveText("Added 1 character.");
  await settings.getByRole("button", { name: "Done" }).click();

  await characters(page).getByRole("button", { name: /^grog/ }).click();
  await expect(sidebar(page)).toContainText("atk");
  await page.getByLabel("Formula").fill("d20+@str, 1d8+3");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText("Critical hit");
  await page.getByRole("button", { name: "Edit grog" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Game system")).toHaveValue("dnd5e");
  await expect(dialog.getByLabel("Crit range")).toHaveValue("19");
});
