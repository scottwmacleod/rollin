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

    const result = page.getByRole("tree", { name: "Roll log" });
    await expect(result).toContainText("2d6+3");
    await expect(result).toContainText("[4, 5] + 3");
    await expect(result).toContainText("total 12");
    await expect(page.getByRole("status")).toHaveText("Rolled 2d6+3: total 12");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("an invalid formula shows the error and where it went wrong, accessibly", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("2d6+");
  await page.getByRole("button", { name: "Roll" }).click();

  const result = page.getByRole("tree", { name: "Roll log" });
  await expect(result).toContainText(
    "error: expected a number, a dice group or '(', found end of input",
  );
  await expect(result.locator("[data-caret]")).toHaveText("2d6+\n    ^");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("a formula over a hard limit is refused with the cap named", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("1001d6");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText(
    "error: dice per term cap (1000) exceeded by '1001d6'",
  );
});

test("a real roll lands inside the dice's range", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("d6");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText(/total [1-6]\b/);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the roll log is driven by keyboard alone, in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript(() =>
      Object.assign(window, {
        __rollinDice: [
          { sides: 6, face: 4 },
          { sides: 6, face: 5 },
          { sides: 20, face: 17 },
        ],
      }),
    );
    await page.goto("/");

    const formula = page.getByLabel("Formula");
    await formula.fill("2d6+3");
    await formula.press("Enter");
    await formula.fill("d20");
    await formula.press("Enter");

    const log = page.getByRole("tree", { name: "Roll log" });
    await expect(log.getByRole("treeitem")).toHaveCount(2);
    // Newest at the bottom, and the page follows it.
    await expect(log.getByRole("treeitem").nth(1)).toContainText("d20");
    await expect(log.getByRole("treeitem").nth(1)).toBeInViewport();

    // Esc leaves the formula box for the log; the log is one tab stop.
    await formula.press("Escape");
    await expect(log.getByRole("treeitem").first()).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(log.getByRole("treeitem").first()).toHaveAttribute("aria-expanded", "true");
    // The breakdown by term and die.
    const term = log.getByRole("treeitem").nth(1);
    await expect(term).toContainText("2d6");
    await expect(term).toContainText("4");
    await expect(term).toContainText("5");
    await expect(term).toContainText("subtotal 9");

    // axe reads an open branch's nested group as visible text missing from its name
    // (a false positive for a tree); every other rule still runs, and the collapsed
    // log is checked with all of them in the first test.
    const results = await new AxeBuilder({ page })
      .disableRules(["label-content-name-mismatch"])
      .analyze();
    expect(results.violations).toEqual([]);

    // Down moves into the term, then to the next entry; focus is never lost.
    await page.keyboard.press("ArrowDown");
    await expect(term).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(log.getByRole("treeitem").nth(2)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowLeft");
    await expect(log.getByRole("treeitem").first()).toHaveAttribute("aria-expanded", "false");
    await expect(log.getByRole("treeitem").first()).toBeFocused();

    // Esc returns to the formula box.
    await page.keyboard.press("Escape");
    await expect(formula).toBeFocused();
  });
}
