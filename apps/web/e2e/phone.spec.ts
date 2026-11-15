import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const log = (page: import("@playwright/test").Page) => page.getByRole("tree", { name: "Roll log" });

test("the keypad builds a formula by tapping and rolls it", async ({ page }) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [
        { sides: 6, face: 4 },
        { sides: 6, face: 5 },
      ],
    }),
  );
  await page.goto("/");
  const pad = page.getByRole("group", { name: "Dice keypad" });
  await pad.getByRole("button", { name: "2", exact: true }).tap();
  await pad.getByRole("button", { name: "d6", exact: true }).tap();
  await pad.getByRole("button", { name: "plus" }).tap();
  await pad.getByRole("button", { name: "3", exact: true }).tap();
  await expect(page.getByLabel("Formula")).toHaveValue("2d6+3");

  await pad.getByRole("button", { name: "Roll" }).tap();
  await expect(log(page)).toContainText("total 12");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("free typing still works beside the keypad", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("d20");
  await page
    .getByRole("group", { name: "Dice keypad" })
    .getByRole("button", { name: "plus" })
    .tap();
  await page.getByRole("group", { name: "Dice keypad" }).getByRole("button", { name: "5" }).tap();
  await expect(page.getByLabel("Formula")).toHaveValue("d20+5");
  await page.getByLabel("Formula").press("Enter");
  await expect(log(page)).toContainText("d20+5");
});

test("a preset rolls in one tap, with no sideways scrolling and 44-point targets", async ({
  page,
}) => {
  await page.addInitScript(() => Object.assign(window, { __rollinDice: [{ sides: 20, face: 7 }] }));
  await page.goto("/");
  await page.getByLabel("Formula").fill("d20+5");
  await page.getByRole("button", { name: "Save as preset" }).tap();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Attack");
  await dialog.getByRole("button", { name: "Save", exact: true }).tap();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "attack d20+5" }).tap();
  await expect(log(page)).toContainText("attack · d20+5");
  await expect(log(page)).toContainText("total 12");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ label: b.textContent, box: b.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ label }) => label),
  );
  expect(small).toEqual([]);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
