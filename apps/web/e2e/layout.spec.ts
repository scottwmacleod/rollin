import { expect, test } from "@playwright/test";
import { axe } from "./axe";
import { stored } from "./helpers";
import {
  expectNewestAboveFormulaBar,
  expectNoPageScroll,
  log,
  rollMany,
  seedPresets,
} from "./layout";

// Full-width desktop (the chromium project, 1280 wide, mouse and keyboard).

test("the page never scrolls; the newest roll sits above the formula bar after many rolls", async ({
  page,
}) => {
  await page.goto("/");
  await rollMany(page, 40);
  await expectNoPageScroll(page);
  await expectNewestAboveFormulaBar(page, "d20+40");
  await expect(page.getByRole("button", { name: "Jump to newest" })).toHaveCount(0);
});

test("the sidebar stays put while the log scrolls", async ({ page }) => {
  await page.goto("/");
  await rollMany(page, 40);
  const sidebar = page.getByRole("complementary", { name: "Characters" });
  const before = await sidebar.boundingBox();
  const scroller = page.locator("[data-roll-scroll]");
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(page.getByRole("button", { name: "Jump to newest" })).toBeVisible();
  const after = await sidebar.boundingBox();
  expect(after?.y).toBe(before?.y);
  await expectNoPageScroll(page);
});

test("scrolling up stops following; Jump to newest brings it back", async ({ page }) => {
  await page.goto("/");
  await rollMany(page, 30);
  const scroller = page.locator("[data-roll-scroll]");
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(page.getByRole("button", { name: "Jump to newest" })).toBeVisible();

  // A roll made elsewhere does not pull the reader away: simulate by checking the position holds
  // after the reader scrolls up and nothing is rolled.
  const top = await scroller.evaluate((el) => el.scrollTop);
  expect(top).toBe(0);

  await page.getByRole("button", { name: "Jump to newest" }).click();
  await expect(page.getByRole("button", { name: "Jump to newest" })).toHaveCount(0);
  await expectNewestAboveFormulaBar(page, "d20+30");

  // Rolling from the formula bar always returns to the bottom, even from far up.
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByLabel("Formula").fill("d20+31");
  await page.getByLabel("Formula").press("Enter");
  await expectNewestAboveFormulaBar(page, "d20+31");
});

test("the sidebar scrolls on its own when its lists are long", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/");
  await seedPresets(page, 30);
  await expect(page.getByRole("button", { name: "preset30 1d20+30" })).toBeAttached();
  await expectNoPageScroll(page);
  const column = page.locator("[data-sidebar]");
  const scrolls = await column.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrolls).toBe(true);
  await column.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByRole("button", { name: "preset30 1d20+30" })).toBeInViewport();
  // The header and formula bar did not move.
  await expect(page.getByRole("button", { name: "Settings" })).toBeInViewport();
  await expect(page.getByLabel("Formula")).toBeInViewport();
});

test("an empty variables or presets section takes one line", async ({ page }) => {
  await page.goto("/");
  const presets = page.getByRole("complementary", { name: "Presets" });
  await expect(presets).toContainText("No presets yet");
  const box = await presets.boundingBox();
  expect(box?.height).toBeLessThan(60);
  const variables = page.getByRole("complementary", { name: /^Variables/ });
  expect((await variables.boundingBox())?.height).toBeLessThan(60);
});

test("there is no keypad under Auto; its button shows it below the log, and the choice survives a reload", async ({
  page,
}) => {
  await page.goto("/");
  const pad = page.getByRole("group", { name: "Dice keypad" });
  await expect(pad).toHaveCount(0);
  const toggle = page.getByRole("button", { name: "Keypad" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await rollMany(page, 25);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(pad).toBeVisible();
  const logBox = await log(page).boundingBox();
  const padBox = await pad.boundingBox();
  expect(logBox && padBox && logBox.y + logBox.height <= padBox.y).toBe(true);
  await expectNoPageScroll(page);
  await expectNewestAboveFormulaBar(page, "d20+25");
  expect((await (await axe(page)).analyze()).violations).toEqual([]);

  await expect
    .poll(async () => ((await stored(page, "settings")) as { keypad?: string })?.keypad)
    .toBe("on");

  await page.reload();
  await expect(page.getByRole("group", { name: "Dice keypad" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keypad" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the Keypad setting and the keypad button stay in sync", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Settings/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/^Auto/)).toBeChecked();
  await dialog.getByLabel("On", { exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Keypad" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Keypad" }).click();
  await page.getByRole("button", { name: /^Settings/ }).click();
  await expect(page.getByRole("dialog").getByLabel("Off", { exact: true })).toBeChecked();
});

test("Clear is in the roll log's menu and the palette, not under the log", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Formula").fill("d6");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Roll log menu" }).click();
  await page.getByRole("menuitem", { name: "Clear roll log" }).click();
  await expect(page.getByRole("button", { name: "Yes, clear" })).toBeFocused();
  expect((await (await axe(page)).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Yes, clear" }).click();
  await expect(page.getByText("Rolls will appear here.")).toBeVisible();
});

test("shortcut hints read ⌘ on a Mac", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Commands" })).toContainText("⌘K");
  await expect(page.getByRole("button", { name: "Settings" })).toContainText("⌘,");
});

test("shortcut hints read Ctrl on Windows and Linux, and the shortcuts work", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "platform", { get: () => "Win32" }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Commands" })).toContainText("Ctrl+K");
  await expect(page.getByRole("button", { name: "Settings" })).toContainText("Ctrl+,");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("a critical hit gets a lime edge and keeps its label, in both themes", async ({ page }) => {
  await page.addInitScript(() =>
    Object.assign(window, { __rollinDice: [{ sides: 20, face: 20 }] }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "New character" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("aria");
  await dialog.getByLabel("Game system").selectOption("dnd5e");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel("Formula").fill("d20+5");
  await page.getByLabel("Formula").press("Enter");
  const roll = log(page).locator('[data-crit="hit"]');
  await expect(roll).toContainText("Critical hit");
  await expect(roll).toHaveCSS("border-left-width", "4px");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect((await (await axe(page)).analyze()).violations).toEqual([]);
  }
});

test("resizing to a narrow window keeps the formula and the log", async ({ page }) => {
  await page.goto("/");
  await rollMany(page, 5);
  await page.getByLabel("Formula").fill("2d6+4");
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.getByLabel("Formula")).toHaveValue("2d6+4");
  await expect(log(page)).toContainText("d20+5");
  await expect(page.getByRole("complementary", { name: "Presets" })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByLabel("Formula")).toHaveValue("2d6+4");
  await expect(page.getByRole("complementary", { name: "Presets" })).toBeVisible();
});

test("the side panels don't shift while the page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New character" })).toBeEnabled();
  // Layout shifts since navigation (buffered) that moved something in a side panel
  // up or down by more than a few pixels, i.e. content arriving late above it.
  // A web-font swap still nudges text sideways by a pixel or two (CLS about
  // 0.0001); that's tracked separately, since the font stacks come from sm-core.
  const shifts = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const seen: string[] = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
            sources: { node?: Node | null; previousRect: DOMRect; currentRect: DOMRect }[];
          }[]) {
            if (entry.hadRecentInput) continue;
            const inPanel = entry.sources.filter(
              (s) =>
                s.node instanceof Element &&
                s.node.closest("aside") &&
                Math.abs(s.currentRect.y - s.previousRect.y) > 4,
            );
            if (inPanel.length === 0) continue;
            const text = inPanel.map((s) => s.node?.textContent?.slice(0, 30) ?? "?");
            seen.push(`${entry.value.toFixed(4)}: ${text.join(", ")}`);
          }
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(seen), 500);
      }),
  );
  expect(shifts).toEqual([]);
});

test("the roll log fades only an edge with content beyond it, and a row stays near 40rem wide", async ({
  page,
}) => {
  await page.goto("/");
  await rollMany(page, 40);
  const scroller = page.locator("[data-roll-scroll]");
  // At the bottom the newest roll is clear: no fade there, a fade at the top.
  await expect(scroller).toHaveAttribute("data-edge-top", "");
  await expect(scroller).not.toHaveAttribute("data-edge-bottom", "");
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(scroller).not.toHaveAttribute("data-edge-top", "");
  await expect(scroller).toHaveAttribute("data-edge-bottom", "");

  const tree = await log(page).boundingBox();
  expect(tree?.width).toBeLessThanOrEqual(640);
});

test("the sidebar fades its bottom edge when the presets run past it", async ({ page }) => {
  await page.goto("/");
  await seedPresets(page, 30);
  const sidebar = page.locator("[data-sidebar]");
  await expect(sidebar).toHaveAttribute("data-edge-bottom", "");
  await sidebar.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(sidebar).not.toHaveAttribute("data-edge-bottom", "");
  await expect(sidebar).toHaveAttribute("data-edge-top", "");
});
