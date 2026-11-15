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

test("a dropped die is marked in the breakdown, accessibly", async ({ page }) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [3, 4, 5, 1].map((face) => ({ sides: 6, face })),
    }),
  );
  await page.goto("/");
  await page.getByLabel("Formula").fill("4d6dl1");
  await page.getByLabel("Formula").press("Enter");

  const result = page.getByRole("tree", { name: "Roll log" });
  await expect(result).toContainText("total 12");
  const dropped = result.locator(".line-through");
  await expect(dropped).toHaveCount(1);
  await expect(dropped).toHaveText("1 dropped");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

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

  // One entry holds all four rolls.
  const log = page.getByRole("tree", { name: "Roll log" });
  await expect(log.getByRole("treeitem")).toHaveCount(1); // collapsed
  const entry = log.getByRole("treeitem").first();
  await expect(entry).toContainText("repeat 1 d20+5 # attack");
  await expect(entry).toContainText("total 20");
  await expect(entry).toContainText("d8+3 # damage");
  await expect(entry).toContainText("total 6");
  await expect(entry).toContainText("repeat 2 d20+5 # attack");
  await expect(entry).toContainText("total 9");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("a repeat over the limit is refused with a hint when it has no dice", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("101x d6");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText(
    "error: repeat cap (100) exceeded by '101x'",
  );
  await page.getByLabel("Formula").fill("2x3");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText(
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

  const result = page.getByRole("tree", { name: "Roll log" });
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
  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText(
    "a success count cannot be used in arithmetic",
  );
});

test("a percentile roll shows the term as typed with its d100 faces", async ({ page }) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [
        { sides: 100, face: 37 },
        { sides: 100, face: 92 },
      ],
    }),
  );
  await page.goto("/");
  await page.getByLabel("Formula").fill("2D%");
  await page.getByLabel("Formula").press("Enter");

  const result = page.getByRole("tree", { name: "Roll log" });
  await expect(result).toContainText("2D%");
  await expect(result).toContainText("[37, 92]");
  await expect(result).toContainText("total 129");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

async function rollOnce(page: import("@playwright/test").Page, formula: string) {
  await page.getByLabel("Formula").fill(formula);
  await page.getByLabel("Formula").press("Enter");
}

test("the roll log survives a reload, and Clear empties it for good", async ({ page }) => {
  await page.goto("/");
  await rollOnce(page, "d6+1");
  const log = page.getByRole("tree", { name: "Roll log" });
  await expect(log).toContainText("d6+1");

  await page.reload();
  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText("d6+1");

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("tree", { name: "Roll log" })).toBeVisible();

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Yes, clear" }).click();
  await expect(page.getByText("Rolls will appear here.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Rolls will appear here.")).toBeVisible();
});

test("a roll in one tab appears in another, and Clear follows", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/");
  await b.goto("/");
  await expect(b.getByText("Rolls will appear here.")).toBeVisible();

  await rollOnce(a, "2d4");
  await expect(b.getByRole("tree", { name: "Roll log" })).toContainText("2d4");

  await rollOnce(b, "d8");
  await expect(a.getByRole("tree", { name: "Roll log" })).toContainText("d8");
  await expect(a.getByRole("tree", { name: "Roll log" })).toContainText("2d4");

  await a.getByRole("button", { name: "Clear", exact: true }).click();
  await a.getByRole("button", { name: "Yes, clear" }).click();
  await expect(b.getByText("Rolls will appear here.")).toBeVisible();
});

test("with storage blocked the app still rolls and says the log won't be kept", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined });
  });
  await page.goto("/");
  await expect(page.getByText(/won't be kept/)).toBeVisible();
  await rollOnce(page, "d20");
  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText("d20");
});
