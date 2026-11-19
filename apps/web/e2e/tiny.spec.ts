import { expect, test } from "@playwright/test";
import { axe } from "./axe";
import { expectNewestAboveFormulaBar, expectNoPageScroll, rollMany } from "./layout";

// A very narrow desktop window: 400px wide, mouse, no touch. It gets the phone arrangement
// without the keypad.

test("the header fits: the character name shows and no shortcut hints crowd it", async ({
  page,
}) => {
  await page.goto("/");
  const character = page.getByRole("button", { name: /^Character:/ });
  await expect(character).toContainText("default");
  await expect(page.getByRole("button", { name: "Commands" })).not.toContainText(/⌘|Ctrl/);
  await expect(page.getByRole("button", { name: "Settings" })).not.toContainText(/⌘|Ctrl/);
  await expectNoPageScroll(page);
});

test("the bottom bar fits: a usable field, and Save as preset is in the More menu", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("group", { name: "Dice keypad" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save as preset" })).toHaveCount(0);
  const field = await page.getByLabel("Formula").boundingBox();
  expect(field?.width).toBeGreaterThanOrEqual(150);
  const roll = await page.getByRole("button", { name: "Roll", exact: true }).boundingBox();
  expect((roll?.x ?? 0) + (roll?.width ?? 0)).toBeLessThanOrEqual(400);

  await page.getByLabel("Formula").fill("d20+5");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Save as preset" }).click();
  await expect(page.getByRole("dialog").getByLabel("Formula")).toHaveValue("d20+5");
});

test("rolls stay visible above the bar, and axe passes", async ({ page }) => {
  await page.goto("/");
  await rollMany(page, 25);
  await expectNoPageScroll(page);
  await expectNewestAboveFormulaBar(page, "d20+25");
  expect((await (await axe(page)).analyze()).violations).toEqual([]);
});
