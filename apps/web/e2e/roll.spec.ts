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
  // Quiet to the eye (faded and struck through, no word), still announced as dropped.
  await expect(dropped).toHaveText("1");
  await expect(dropped).toHaveCSS("opacity", "0.6");
  await expect(page.getByText("dropped", { exact: false })).toHaveCount(0);
  // The accessible name of the roll still says which die was dropped.
  await expect(result.getByRole("treeitem", { name: /1 dropped/ }).first()).toBeAttached();

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

/** Clears the roll log from its menu, as a person does. */
async function openClear(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Roll log menu" }).click();
  await page.getByRole("menuitem", { name: "Clear roll log" }).click();
}

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

  await expect(page.getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);
  await openClear(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("tree", { name: "Roll log" })).toBeVisible();

  await openClear(page);
  await page.getByRole("button", { name: "Yes, clear" }).click();
  await expect(page.getByText("Rolls will appear here.")).toBeVisible();

  // The delete is saved in the background; wait for it before reloading, as a person would.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<unknown>((resolve) => {
            const open = indexedDB.open("rollin");
            open.onsuccess = () => {
              const get = open.result.transaction("kv").objectStore("kv").get("rollLog");
              get.onsuccess = () => {
                open.result.close();
                resolve(get.result);
              };
            };
          }),
      ),
    )
    .toBeUndefined();

  await page.reload();
  await expect(page.getByText("Rolls will appear here.")).toBeVisible();
});

test("only a roll made now arrives with motion, and never under reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  await rollOnce(page, "d6+1");
  await page.reload();
  const log = page.getByRole("tree", { name: "Roll log" });
  await expect(log).toContainText("d6+1");
  // History that loads with the page animates nothing.
  await expect(page.locator(".roll-arrive")).toHaveCount(0);

  await rollOnce(page, "d8");
  await rollOnce(page, "d4");
  // Only the newest roll carries the arrival.
  await expect(page.locator(".roll-arrive")).toHaveCount(1);
  await expect(page.locator(".roll-arrive")).toContainText("d4");
  const animation = await page
    .locator(".roll-arrive")
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("roll-arrive");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await rollOnce(page, "d10");
  const reduced = await page
    .locator(".roll-arrive")
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(reduced).toBe("none");
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

  await openClear(a);
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

test.describe("settings", () => {
  const bgOf = (page: import("@playwright/test").Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  test("opens from the button and by keyboard, and has no accessibility violations", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Settings/ }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByLabel("Formula").focus();
    await page.keyboard.press("ControlOrMeta+,");
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  });

  test("a chosen theme survives reload, with no flash, and reaches a second tab", async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const second = await context.newPage();
    await second.emulateMedia({ colorScheme: "dark" });
    await second.goto("/");
    const dark = await bgOf(page);

    await page.getByRole("button", { name: /Settings/ }).click();
    await page.getByRole("radio", { name: /Light/ }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await bgOf(page)).not.toBe(dark);
    await expect(second.locator("html")).toHaveAttribute("data-theme", "light");

    // The saved theme is applied by the inline script before the app loads.
    await page.reload({ waitUntil: "commit" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    await page.getByRole("button", { name: /Settings/ }).click();
    await expect(page.getByRole("radio", { name: /Light/ })).toBeChecked();

    await page.getByRole("radio", { name: /System/ }).check();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    expect(await bgOf(page)).toBe(dark);
  });
});

test.describe("global presets", () => {
  const log = (page: import("@playwright/test").Page) =>
    page.getByRole("tree", { name: "Roll log" });

  async function savePreset(page: import("@playwright/test").Page, name: string, formula: string) {
    await page.getByRole("button", { name: "New preset" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Formula").fill(formula);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  test("save, roll, edit, delete and reload", async ({ page }) => {
    await page.addInitScript(() =>
      Object.assign(window, {
        __rollinDice: [
          { sides: 20, face: 7 },
          { sides: 20, face: 12 },
        ],
      }),
    );
    await page.goto("/");
    const sidebar = page.getByRole("complementary", { name: "Presets" });
    await expect(sidebar).toContainText("No presets yet");

    // Save the current formula as a preset.
    await page.getByLabel("Formula").fill("d20+5");
    await page.getByRole("button", { name: "Save as preset" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Formula")).toHaveValue("d20+5");
    await dialog.getByLabel("Name").fill("Attack");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(sidebar.getByRole("button", { name: "attack d20+5" })).toBeVisible();

    // Roll it with one click: the log carries the preset's name.
    await sidebar.getByRole("button", { name: "attack d20+5" }).click();
    await expect(log(page)).toContainText("attack · d20+5");
    await expect(log(page)).toContainText("total 12");
    await expect(page.getByRole("status")).toHaveText("Rolled attack (d20+5): total 12");

    // Typing the name rolls it too.
    await page.getByLabel("Formula").fill("ATTACK");
    await page.getByLabel("Formula").press("Enter");
    await expect(log(page)).toContainText("total 17");

    // Survives a reload.
    await page.reload();
    await expect(sidebar.getByRole("button", { name: "attack d20+5" })).toBeVisible();

    // Edit: rename and change the formula.
    await sidebar.getByRole("button", { name: "Edit attack" }).click();
    await dialog.getByLabel("Name").fill("strike");
    await dialog.getByLabel("Formula").fill("d20+7");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sidebar.getByRole("button", { name: "strike d20+7" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "attack d20+5" })).toHaveCount(0);
    // The renamed preset's old Edit button is gone, so focus lands in the formula box.
    await expect(page.getByLabel("Formula")).toBeFocused();

    // Delete, after a confirmation.
    await sidebar.getByRole("button", { name: "Edit strike" }).click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Keep it" }).click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Yes, delete" }).click();
    await expect(dialog).toBeHidden();
    await expect(sidebar).toContainText("No presets yet");
    await expect(page.getByLabel("Formula")).toBeFocused();
    await page.reload();
    await expect(sidebar).toContainText("No presets yet");
  });

  test("names and formulas are checked as the Rust engine checks them", async ({ page }) => {
    await page.goto("/");
    await savePreset(page, "atk", "d20+5");

    await page.getByRole("button", { name: "New preset" }).click();
    const dialog = page.getByRole("dialog");
    const save = dialog.getByRole("button", { name: "Save", exact: true });

    await dialog.getByLabel("Name").fill("save");
    await expect(dialog).toContainText("it is a command word");
    await expect(save).toBeDisabled();
    await dialog.getByLabel("Name").fill("d6");
    await expect(dialog).toContainText("it would parse as the dice formula d6");
    await dialog.getByLabel("Name").fill("9lives");
    await expect(dialog).toContainText("names must start with a letter");

    await dialog.getByLabel("Name").fill("bad");
    await dialog.getByLabel("Formula").fill("d20+");
    await expect(dialog).toContainText(
      "error: expected a number, a dice group or '(', found end of input",
    );
    await expect(save).toBeDisabled();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // A name that is taken says so and the button says Replace.
    await dialog.getByLabel("Name").fill("ATK");
    await dialog.getByLabel("Formula").fill("d20+9");
    await expect(dialog).toContainText("already exists");
    await dialog.getByRole("button", { name: "Replace" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "atk d20+9" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^atk d20/ })).toHaveCount(1);
  });

  test("Escape and Cancel close the dialog without saving", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New preset" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("nope");
    await dialog.getByLabel("Formula").fill("d4");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "New preset" })).toBeFocused();
    await expect(page.getByRole("complementary", { name: "Presets" })).toContainText(
      "No presets yet",
    );
  });

  test("an unknown name suggests a saved one", async ({ page }) => {
    await page.goto("/");
    await savePreset(page, "fireball", "8d6");
    await page.getByLabel("Formula").fill("firebal");
    await page.getByLabel("Formula").press("Enter");
    await expect(log(page)).toContainText("'firebal' is not a valid formula or a known preset");
    await expect(log(page)).toContainText("hint: did you mean 'fireball'?");
  });

  test("a preset saved in one tab appears in another, and a delete follows", async ({
    context,
  }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto("/");
    await b.goto("/");
    await savePreset(a, "smite", "2d8+3");
    await expect(b.getByRole("button", { name: "smite 2d8+3" })).toBeVisible();

    await b.getByRole("button", { name: "Edit smite" }).click();
    await b.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await b.getByRole("button", { name: "Yes, delete" }).click();
    await expect(a.getByRole("button", { name: "smite 2d8+3" })).toHaveCount(0);
  });
});

test.describe("characters and variables", () => {
  type Page = import("@playwright/test").Page;
  const log = (page: Page) => page.getByRole("tree", { name: "Roll log" });

  async function newCharacter(page: Page, name: string) {
    await page.getByRole("button", { name: "New character" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toBeHidden();
  }

  async function setVariable(page: Page, name: string, value: string) {
    await page.getByRole("button", { name: "New variable" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Value").fill(value);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  test("create a character, set @str, roll d20+@str and switch", async ({ page }) => {
    await page.addInitScript(() =>
      Object.assign(window, {
        __rollinDice: [
          { sides: 20, face: 10 },
          { sides: 20, face: 10 },
        ],
      }),
    );
    await page.goto("/");
    const characters = page.getByRole("complementary", { name: "Characters" });
    await expect(characters.getByRole("button", { name: /^default/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The new-character dialog checks the name as it is typed.
    await page.getByRole("button", { name: "New character" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("roll");
    await expect(dialog).toContainText("it is a command word");
    await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
    await dialog.getByLabel("Name").fill("Aria");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toBeHidden();
    await expect(characters.getByRole("button", { name: /^aria/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await setVariable(page, "@STR", "3");
    const variables = page.getByRole("complementary", { name: /^Variables/ });
    await expect(variables).toContainText("@str");

    await page.getByLabel("Formula").fill("d20+@str");
    await page.getByLabel("Formula").press("Enter");
    await expect(log(page)).toContainText("total 13");

    // Switching changes which variables apply, straight away.
    await characters.getByRole("button", { name: /^default/ }).click();
    await expect(variables).toContainText("No variables yet");
    await page.getByLabel("Formula").fill("d20+@str");
    await page.getByLabel("Formula").press("Enter");
    await expect(log(page)).toContainText("undefined variable @str on character 'default'");

    await characters.getByRole("button", { name: /^aria/ }).click();
    await expect(variables).toContainText("@str");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("an unknown variable gets the defined names and a suggestion", async ({ page }) => {
    await page.goto("/");
    await setVariable(page, "str", "3");
    await page.getByLabel("Formula").fill("d20+@stre");
    await page.getByLabel("Formula").press("Enter");
    await expect(log(page)).toContainText("error: undefined variable @stre on character 'default'");
    await expect(log(page)).toContainText("defined: str");
    await expect(log(page)).toContainText("did you mean @str?");
    await expect(log(page).locator("[data-caret]")).toHaveText("d20+@stre\n    ^^^^^");
  });

  test("a character's preset shadows a global one, and everything survives a reload", async ({
    page,
  }) => {
    await page.goto("/");
    const presets = page.getByRole("complementary", { name: "Presets" });

    async function savePreset(name: string, formula: string, scope: string) {
      await page.getByRole("button", { name: "New preset" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByLabel("Formula").fill(formula);
      await dialog.getByLabel(scope).check();
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toBeHidden();
    }

    await savePreset("attack", "d20+1", "Every character");
    await expect(presets.getByRole("button", { name: "attack d20+1 global" })).toBeVisible();

    await newCharacter(page, "aria");
    await savePreset("attack", "d20+7", "Only aria");
    await expect(presets.getByRole("button", { name: /^attack/ })).toHaveCount(1);
    await expect(presets.getByRole("button", { name: "attack d20+7" })).toBeVisible();

    await page.reload();
    await expect(presets.getByRole("button", { name: "attack d20+7" })).toBeVisible();

    // The other character still sees the global one.
    await page
      .getByRole("complementary", { name: "Characters" })
      .getByRole("button", { name: /^default/ })
      .click();
    await expect(presets.getByRole("button", { name: "attack d20+1 global" })).toBeVisible();
  });

  test("characters and variables sync to a second tab", async ({ context }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto("/");
    await b.goto("/");
    await newCharacter(a, "aria");
    await setVariable(a, "str", "3");
    const characters = b.getByRole("complementary", { name: "Characters" });
    await expect(characters.getByRole("button", { name: /^aria/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(b.getByRole("complementary", { name: /^Variables/ })).toContainText("@str");

    // Rename and delete from the second tab.
    await b.getByRole("button", { name: "Edit aria" }).click();
    const dialog = b.getByRole("dialog");
    await dialog.getByLabel("Name").fill("bo");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(a.getByRole("complementary", { name: "Characters" })).toContainText("bo");
    await b.getByRole("button", { name: "Edit bo" }).click();
    await b.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await b.getByRole("button", { name: "Yes, delete" }).click();
    await expect(a.getByRole("complementary", { name: "Characters" })).not.toContainText("bo");
    await expect(
      a
        .getByRole("complementary", { name: "Characters" })
        .getByRole("button", { name: /^default/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test("Up and Down in the formula box step through past rolls and back to the draft", async ({
  page,
}) => {
  await page.goto("/");
  const formula = page.getByLabel("Formula");
  await formula.fill("d20");
  await formula.press("Enter");
  await formula.fill("2d6+3");
  await formula.press("Enter");

  await formula.fill("d4");
  await formula.press("ArrowUp");
  await expect(formula).toHaveValue("2d6+3");
  await formula.press("ArrowUp");
  await expect(formula).toHaveValue("d20");
  await formula.press("ArrowUp");
  await expect(formula).toHaveValue("d20");
  await formula.press("ArrowDown");
  await expect(formula).toHaveValue("2d6+3");
  await formula.press("ArrowDown");
  await expect(formula).toHaveValue("d4");
});
