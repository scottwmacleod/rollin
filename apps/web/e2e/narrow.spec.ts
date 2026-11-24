import { expect, test } from "@playwright/test";

import { axe } from "./axe";
import {
  expectNewestAboveFormulaBar,
  expectNoPageScroll,
  log,
  rollMany,
  seedPresets,
} from "./layout";

test("the page never scrolls and the newest roll sits above the formula bar", async ({ page }) => {
  await page.goto("/");
  await rollMany(page, 40);
  await expectNoPageScroll(page);
  await expectNewestAboveFormulaBar(page, "d20+40");
});

test("there is no keypad under Auto, and shown, it fits without page scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("group", { name: "Dice keypad" })).toHaveCount(0);
  await page.getByRole("button", { name: "Keypad" }).click();
  await expect(page.getByRole("group", { name: "Dice keypad" })).toBeVisible();
  await expectNoPageScroll(page);
  expect((await (await axe(page)).analyze()).violations).toEqual([]);
});

test("the character button opens a slide-over that traps focus and closes three ways", async ({
  page,
}) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Character: default" });
  await expect(page.getByRole("complementary", { name: "Presets" })).toHaveCount(0);

  await button.click();
  const sheet = page.getByRole("dialog", { name: "Characters and presets" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("complementary", { name: "Presets" })).toBeVisible();
  await expect(sheet.getByRole("complementary", { name: "Characters" })).toBeVisible();
  expect((await (await axe(page)).analyze()).violations).toEqual([]);

  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
    true,
  );

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await button.click();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();

  await button.click();
  await page.mouse.click(690, 400);
  await expect(sheet).toBeHidden();
});

test("a preset in the slide-over still rolls", async ({ page }) => {
  await page.goto("/");
  await seedPresets(page, 3);
  await page.getByRole("button", { name: /^Character:/ }).click();
  await page
    .getByRole("dialog", { name: "Characters and presets" })
    .getByRole("button", { name: "preset02 1d20+2" })
    .click();
  await expect(log(page)).toContainText("preset02 · 1d20+2");
});

test("preset chips roll in one click, and scroll sideways without the page doing so", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Preset shortcuts" })).toHaveCount(0);
  await seedPresets(page, 20);
  const chips = page.getByRole("list", { name: "Preset shortcuts" });
  await expect(chips).toBeVisible();
  expect(await chips.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expectNoPageScroll(page);
  await chips.getByRole("button", { name: "preset01" }).click();
  await expect(log(page)).toContainText("preset01 · 1d20+1");
  await expectNewestAboveFormulaBar(page, "preset01 · 1d20+1");
  expect((await (await axe(page)).analyze()).violations).toEqual([]);
});

test("chips follow the character, and a character's preset hides the global one", async ({
  page,
}) => {
  await page.goto("/");
  await seedPresets(page, 2);
  await page.getByRole("button", { name: /^Character:/ }).click();
  const sheet = page.getByRole("dialog", { name: "Characters and presets" });
  await sheet.getByRole("button", { name: "New preset" }).click();
  const dialog = page.getByRole("dialog", { name: "New preset" });
  await dialog.getByLabel("Name").fill("preset01");
  await dialog.getByLabel("Formula").fill("9d6");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  const chips = page.getByRole("list", { name: "Preset shortcuts" });
  await expect(chips.getByRole("button", { name: "preset01" })).toHaveCount(1);
  await expect(chips.getByRole("button", { name: "preset01" })).toHaveAttribute("title", "9d6");
});

test("the tab order runs header, character button, roll log, chips, formula field", async ({
  page,
}) => {
  await page.goto("/");
  await seedPresets(page, 2);
  await page.getByLabel("Formula").fill("d6");
  await page.getByLabel("Formula").press("Enter");
  const order = await page.evaluate(() => {
    const at = (el: Element | null) => (el ? [...document.querySelectorAll("*")].indexOf(el) : -1);
    return [
      at(document.querySelector('[aria-label^="Character:"]')),
      at(document.querySelector('[role="tree"]')),
      at(document.querySelector('[aria-label="Preset shortcuts"]')),
      at(document.querySelector('[role="combobox"]')),
    ];
  });
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(order.every((n) => n >= 0)).toBe(true);
});

test("resizing to full width keeps the formula, and the sidebar replaces the button", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("3d8");
  await page.getByRole("button", { name: /^Character:/ }).click();
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.getByLabel("Formula")).toHaveValue("3d8");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Presets" })).toBeVisible();
});

test.describe("popup motion", () => {
  const sheetOf = (page: import("@playwright/test").Page) =>
    page.getByRole("dialog", { name: "Characters and presets" });

  test("the slide-over slides in from the left and returns focus on close", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Character: default" }).click();
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();
    const name = await sheet.evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toContain("enter");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Character: default" })).toBeFocused();
  });

  test("menus and the palette fade and scale in", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Formula").fill("d6");
    await page.getByLabel("Formula").press("Enter");
    await page.getByRole("button", { name: "Roll log menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((el) => getComputedStyle(el).animationName)).toContain("enter");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    expect(await palette.evaluate((el) => getComputedStyle(el).animationName)).toContain("enter");
  });

  test("under reduced motion, popups open and close at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Character: default" }).click();
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("0s");
  });
});
