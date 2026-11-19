import { expect, test } from "@playwright/test";
import { axe } from "./axe";
import {
  expectNewestAboveFormulaBar,
  expectNoPageScroll,
  log,
  rollMany,
  seedPresets,
} from "./layout";

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
  await expectNewestAboveFormulaBar(page, "2d6+3");

  const results = await (await axe(page)).analyze();
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

test("the keypad shows under Auto, and its button hides and restores it", async ({ page }) => {
  await page.goto("/");
  const pad = page.getByRole("group", { name: "Dice keypad" });
  const toggle = page.getByRole("button", { name: "Keypad" });
  await expect(pad).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.tap();
  await expect(pad).toHaveCount(0);
  // With the keypad off, Roll sits beside the formula field.
  await expect(page.getByRole("button", { name: "Roll", exact: true })).toBeVisible();
  await toggle.tap();
  await expect(pad).toBeVisible();
});

test("with the keypad on, the roll log keeps about half the screen", async ({ page }) => {
  await page.goto("/");
  await seedPresets(page, 5);
  await rollMany(page, 3);
  const viewport = page.viewportSize();
  const scroller = await page.locator("[data-roll-scroll]").boundingBox();
  expect(scroller && viewport && scroller.height / viewport.height).toBeGreaterThanOrEqual(0.45);
});

test("no shortcut hints show on a touch screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Commands" })).not.toContainText(/⌘|Ctrl/);
  await expect(page.getByRole("button", { name: "Settings" })).not.toContainText(/⌘|Ctrl/);
});

test("Save as preset is in a menu beside the formula field and opens the dialog filled in", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("d20+5");
  await expect(page.getByRole("button", { name: "Save as preset" })).toHaveCount(0);
  await page.getByRole("button", { name: "More" }).tap();
  const item = page.getByRole("menuitem", { name: "Save as preset" });
  // Polled: the menu scales up from 0.97 as it opens.
  await expect.poll(async () => (await item.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await item.tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Formula")).toHaveValue("d20+5");
});

test("a preset chip rolls in one tap, with no sideways scrolling and 44-point targets", async ({
  page,
}) => {
  await page.addInitScript(() => Object.assign(window, { __rollinDice: [{ sides: 20, face: 7 }] }));
  await page.goto("/");
  await page.getByLabel("Formula").fill("d20+5");
  await page.getByRole("button", { name: "More" }).tap();
  await page.getByRole("menuitem", { name: "Save as preset" }).tap();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Attack");
  await dialog.getByRole("button", { name: "Save", exact: true }).tap();
  await expect(dialog).toBeHidden();

  await page
    .getByRole("list", { name: "Preset shortcuts" })
    .getByRole("button", { name: "attack" })
    .tap();
  await expect(log(page)).toContainText("attack · d20+5");
  await expect(log(page)).toContainText("total 12");
  await expectNewestAboveFormulaBar(page, "attack · d20+5");
  await expectNoPageScroll(page);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, [role=menuitem]")]
      .filter((b) => (b as HTMLElement).offsetParent !== null)
      .map((b) => ({
        label: b.textContent || b.getAttribute("aria-label"),
        box: b.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ label }) => label),
  );
  expect(small).toEqual([]);

  const results = await (await axe(page)).analyze();
  expect(results.violations).toEqual([]);
});

test("the character slide-over works on a phone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Character:/ }).tap();
  const sheet = page.getByRole("dialog", { name: "Characters and presets" });
  await expect(sheet).toBeVisible();
  expect((await (await axe(page)).analyze()).violations).toEqual([]);
  await sheet.getByRole("button", { name: "Close" }).tap();
  await expect(sheet).toBeHidden();
});

test("Clear is in the More menu on a phone, and asks first", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("d6");
  await page.getByLabel("Formula").press("Enter");
  await page.getByRole("button", { name: "More" }).tap();
  const item = page.getByRole("menuitem", { name: "Clear roll log" });
  // Polled: the menu scales up from 0.97 as it opens.
  await expect.poll(async () => (await item.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await item.tap();
  await expect(page.getByRole("button", { name: "Yes, clear" })).toBeVisible();
  await page.getByRole("button", { name: "Yes, clear" }).tap();
  await expect(page.getByText("Rolls will appear here.")).toBeVisible();
});

test("after a roll, the keypad's next digit or die starts a new formula", async ({ page }) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [
        { sides: 6, face: 4 },
        { sides: 6, face: 2 },
        { sides: 6, face: 5 },
        { sides: 6, face: 1 },
      ],
    }),
  );
  await page.goto("/");
  const pad = page.getByRole("group", { name: "Dice keypad" });
  const formula = page.getByLabel("Formula");
  await pad.getByRole("button", { name: "2", exact: true }).tap();
  await pad.getByRole("button", { name: "d6", exact: true }).tap();
  await pad.getByRole("button", { name: "Roll" }).tap();
  await expect(log(page)).toContainText("total 6");

  // The rolled formula stays, so rolling it again is one tap.
  await expect(formula).toHaveValue("2d6");
  await pad.getByRole("button", { name: "Roll" }).tap();
  await expect(log(page)).toContainText("total 6");

  // An operator carries on from it; a digit starts afresh.
  await pad.getByRole("button", { name: "plus" }).tap();
  await expect(formula).toHaveValue("2d6+");
  await pad.getByRole("button", { name: "Roll" }).tap();
  await pad.getByRole("button", { name: "1", exact: true }).tap();
  await expect(formula).toHaveValue("1");
});

test("the header gives the character its full name, with icon buttons beside it", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("rollin");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(
            { active: "throkmaren", characters: [{ name: "throkmaren", vars: {}, presets: {} }] },
            "characters",
          );
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  const name = page.getByRole("button", { name: "Character: throkmaren" }).locator(".truncate");
  await expect(name).toHaveText("throkmaren");
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  for (const label of ["Commands", "Settings"]) {
    const button = page.getByRole("button", { name: label, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await expectNoPageScroll(page);
});

test("the formula field doesn't take focus on load, so no system keyboard covers the keypad", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("group", { name: "Dice keypad" })).toBeVisible();
  await expect(page.getByLabel("Formula")).not.toBeFocused();
});

test("keypad keys and chips act on a quick tap, with no double-tap zoom", async ({ page }) => {
  await page.goto("/");
  await seedPresets(page, 1);
  const key = page
    .getByRole("group", { name: "Dice keypad" })
    .getByRole("button", { name: "2", exact: true });
  await expect(key).toHaveCSS("touch-action", "manipulation");
  const chip = page.getByRole("list", { name: "Preset shortcuts" }).getByRole("button").first();
  await expect(chip).toHaveCSS("touch-action", "manipulation");
});

test("a one-group roll keeps its total on the dice's line", async ({ page }) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [3, 1, 6, 2, 5, 4, 6, 2].map((face) => ({ sides: 6, face })),
    }),
  );
  await page.goto("/");
  await page.getByLabel("Formula").fill("8d6");
  await page.getByLabel("Formula").press("Enter");
  const entry = log(page).getByRole("treeitem").first();
  await expect(entry).toContainText("total 29");
  const dice = await entry.locator("[data-term]").boundingBox();
  const total = await entry.getByText("total").boundingBox();
  expect(dice).not.toBeNull();
  expect(total).not.toBeNull();
  if (!dice || !total) return;
  // The total's label sits beside the dice, not on a line of its own below them.
  expect(total.y).toBeLessThan(dice.y + dice.height);
});

test.describe("swipe left to close the slide-over", () => {
  type Page = import("@playwright/test").Page;

  /** A one-finger drag by `dx`, `dy` in `steps` moves, as real touch events. */
  async function drag(
    page: Page,
    from: { x: number; y: number },
    dx: number,
    dy: number,
    steps = 12,
  ) {
    const cdp = await page.context().newCDPSession(page);
    const point = (i: number) => [
      { x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps, id: 1 },
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(0) });
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(i) });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  }

  async function open(page: Page) {
    await page.goto("/");
    await page.getByRole("button", { name: /^Character:/ }).tap();
    const sheet = page.getByRole("dialog", { name: "Characters and presets" });
    await expect(sheet).toBeVisible();
    await expect.poll(() => sheet.evaluate((el) => el.getBoundingClientRect().left)).toBe(0);
    const box = await sheet.boundingBox();
    if (!box) throw new Error("no slide-over");
    return { sheet, box, from: { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5 } };
  }

  test("a left drag past a third closes it", async ({ page }) => {
    const { sheet, box, from } = await open(page);
    await drag(page, from, -box.width * 0.45, 0);
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Character:/ })).toBeFocused();
  });

  test("a short slow drag springs back, and a vertical drag doesn't move it", async ({ page }) => {
    const { sheet, box, from } = await open(page);
    await drag(page, from, -box.width * 0.15, 0, 20);
    await expect(sheet).toBeVisible();
    await expect.poll(() => sheet.evaluate((el) => el.getBoundingClientRect().left)).toBe(0);

    await drag(page, from, -10, -200);
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((el) => el.getBoundingClientRect().left)).toBe(0);
  });

  test("the close button, tapping outside and Escape still close it", async ({ page }) => {
    let { sheet } = await open(page);
    await sheet.getByRole("button", { name: "Close" }).tap();
    await expect(sheet).toHaveCount(0);

    ({ sheet } = await open(page));
    const viewport = page.viewportSize();
    await page.touchscreen.tap((viewport?.width ?? 390) - 10, (viewport?.height ?? 800) / 2);
    await expect(sheet).toHaveCount(0);

    ({ sheet } = await open(page));
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });
});
