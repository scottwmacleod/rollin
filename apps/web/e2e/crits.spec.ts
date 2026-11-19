import { expect, type Page, test } from "@playwright/test";
import { axe } from "./helpers";

const log = (page: Page) => page.getByRole("tree", { name: "Roll log" });

async function newCharacter(page: Page, name: string, system?: string, critRange?: string) {
  await page.getByRole("button", { name: "New character" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  if (system) await dialog.getByLabel("Game system").selectOption(system);
  if (critRange) await dialog.getByLabel("Crit range").fill(critRange);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}

const script = (page: Page, dice: [number, number][]) =>
  page.addInitScript(
    (draws) =>
      Object.assign(window, {
        __rollinDice: draws.map(([sides, face]) => ({ sides, face })),
      }),
    dice,
  );

test.describe("D&D 5e checks and crits", () => {
  test("a natural 20 attack doubles the damage dice that follow", async ({ page }) => {
    // d20 -> 20, then 1d8 rolled twice (doubled): 6 and 5.
    await script(page, [
      [20, 20],
      [8, 6],
      [8, 5],
    ]);
    await page.goto("/");
    await newCharacter(page, "aria", "dnd5e");

    await page.getByLabel("Formula").fill("d20+5, 1d8+3");
    await page.getByLabel("Formula").press("Enter");

    const result = log(page);
    await expect(result).toContainText("Critical hit");
    await expect(result).toContainText("Dice doubled");
    await expect(result).toContainText("6 5 + 3");
    await expect(result).toContainText("total 25");
    await expect(result).toContainText("total 14");
    await expect(page.getByRole("status")).toHaveText(
      "Rolled d20+5, 1d8+3: total 25, critical hit, total 14, damage dice doubled",
    );

    const results = await axe(page);
    expect(results.violations).toEqual([]);
  });

  test("a natural 1 is a critical miss and leaves the damage alone", async ({ page }) => {
    await script(page, [
      [20, 1],
      [8, 4],
    ]);
    await page.goto("/");
    await newCharacter(page, "aria", "dnd5e");
    await page.getByLabel("Formula").fill("d20+5, 1d8+3");
    await page.getByLabel("Formula").press("Enter");
    await expect(log(page)).toContainText("Critical miss");
    await expect(log(page)).not.toContainText("Dice doubled");
    await expect(page.getByRole("status")).toContainText("critical miss");
  });

  test("a crit range of 19 makes a 19 a critical hit", async ({ page }) => {
    await script(page, [
      [20, 19],
      [8, 2],
      [8, 5],
    ]);
    await page.goto("/");
    await newCharacter(page, "aria", "dnd5e", "19");
    await page.getByLabel("Formula").fill("d20+5, 1d8+3");
    await page.getByLabel("Formula").press("Enter");
    await expect(log(page)).toContainText("Critical hit");
    await expect(log(page)).toContainText("2 5 + 3");
  });

  test("a character with no game system never shows crits", async ({ page }) => {
    await script(page, [
      [20, 20],
      [8, 6],
    ]);
    await page.goto("/");
    await page.getByLabel("Formula").fill("d20+5, 1d8+3");
    await page.getByLabel("Formula").press("Enter");
    await expect(log(page)).toContainText("total 25");
    await expect(log(page)).toContainText("total 9");
    await expect(log(page)).not.toContainText("Critical");
    await expect(log(page)).not.toContainText("Dice doubled");
  });

  test("a crit range outside 2 to 20 is refused", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New character" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("aria");
    await dialog.getByLabel("Game system").selectOption("dnd5e");
    await dialog.getByLabel("Crit range").fill("1");
    await expect(dialog).toContainText("crit range is a whole number from 2 to 20");
    await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
  });
});
