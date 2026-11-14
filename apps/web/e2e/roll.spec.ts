import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const scheme of ["light", "dark"] as const) {
  test(`rolling 2d6+3 with scripted dice shows the total and both dice in ${scheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    // The test build reads its dice from here; the production build has no such hook.
    await page.addInitScript(() =>
      Object.assign(window, {
        __rollinDice: [
          { sides: 6, face: 4 },
          { sides: 6, face: 5 },
        ],
      }),
    );
    await page.goto("/");

    await page.getByLabel("Formula").fill("2d6+3");
    await page.getByLabel("Formula").press("Enter");

    const result = page.getByRole("region", { name: "Result" });
    await expect(result).toContainText("› 2d6+3");
    await expect(result).toContainText("[4, 5] + 3");
    await expect(result).toContainText("total 12");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("an invalid formula shows the error and where it went wrong, accessibly", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("2d6+");
  await page.getByRole("button", { name: "Roll" }).click();

  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText(
    "error: expected a number, a dice group or '(', found end of input",
  );
  await expect(result.locator("pre")).toHaveText("2d6+\n    ^");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("a formula over a hard limit is refused with the cap named", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("1001d6");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("region", { name: "Result" })).toContainText(
    "error: dice per term cap (1000) exceeded by '1001d6'",
  );
});

test("a real roll lands inside the dice's range", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("d6");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("region", { name: "Result" })).toContainText(/total [1-6]\b/);
});

test("a labelled, repeated formula shows each roll with its label and repeat number", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [
        { sides: 20, face: 15 },
        { sides: 8, face: 3 },
        { sides: 20, face: 4 },
        { sides: 8, face: 6 },
      ],
    }),
  );
  await page.goto("/");
  await page.getByLabel("Formula").fill("2x d20+5 # attack, d8+3 # damage");
  await page.getByLabel("Formula").press("Enter");

  const rows = page.getByRole("region", { name: "Result" }).getByRole("listitem");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("repeat 1 d20+5 # attack");
  await expect(rows.nth(0)).toContainText("total 20");
  await expect(rows.nth(1)).toContainText("d8+3 # damage");
  await expect(rows.nth(1)).toContainText("total 6");
  await expect(rows.nth(2)).toContainText("repeat 2 d20+5 # attack");
  await expect(rows.nth(2)).toContainText("total 9");
  await expect(rows.nth(3)).toContainText("total 9");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("a repeat over the limit is refused with a hint when it has no dice", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("101x d6");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("region", { name: "Result" })).toContainText(
    "error: repeat cap (100) exceeded by '101x'",
  );
  await page.getByLabel("Formula").fill("2x3");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("region", { name: "Result" })).toContainText(
    "hint: for multiplication use *; did you mean 2*3?",
  );
});

test("a success count marks each die and reports successes minus failures", async ({ page }) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [
        { sides: 10, face: 9 },
        { sides: 10, face: 5 },
        { sides: 10, face: 1 },
      ],
    }),
  );
  await page.goto("/");
  await page.getByLabel("Formula").fill("3d10>=8f1");
  await page.getByLabel("Formula").press("Enter");

  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText("9 ✓");
  await expect(result).toContainText("1 ✗");
  await expect(result).toContainText("total 0");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("a success count in arithmetic is refused with the reason", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("6d10>=8+2");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("region", { name: "Result" })).toContainText(
    "a success count cannot be used in arithmetic",
  );
});
