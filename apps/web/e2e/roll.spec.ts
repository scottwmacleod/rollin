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
