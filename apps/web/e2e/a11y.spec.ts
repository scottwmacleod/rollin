import { expect, type Page, test } from "@playwright/test";
import { axe } from "./helpers";

const log = (page: Page) => page.getByRole("tree", { name: "Roll log" });

async function expectClean(page: Page, where: string) {
  const { violations } = await axe(page);
  expect(
    violations.map(
      (v) => `${where}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target).join(" ")}`,
    ),
  ).toEqual([]);
}

/** Gives the page something in every region: a character, a variable, presets and rolls. */
async function populate(page: Page) {
  await page.getByRole("button", { name: "New character" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Aria");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "New variable" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("str");
  await dialog.getByLabel("Value").fill("3");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "New preset" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("attack");
  await dialog.getByLabel("Formula").fill("d20+@str");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel("Formula").fill("2d6+3");
  await page.getByLabel("Formula").press("Enter");
  await expect(log(page)).toContainText("2d6+3");
  // Axe reads colours as they are now, so let the 150ms arrival finish first.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}

for (const scheme of ["light", "dark"] as const) {
  test(`every screen and dialog passes axe in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expectClean(page, "empty page");
    await populate(page);
    await expectClean(page, "populated page");

    const dialog = page.getByRole("dialog");
    // Each opener, with what to open; Escape must close every one and give focus back.
    const openers: [string, () => Promise<void>][] = [
      ["new preset", () => page.getByRole("button", { name: "New preset" }).click()],
      ["edit preset", () => page.getByRole("button", { name: "Edit attack" }).click()],
      ["new character", () => page.getByRole("button", { name: "New character" }).click()],
      ["edit character", () => page.getByRole("button", { name: "Edit Aria" }).click()],
      ["new variable", () => page.getByRole("button", { name: "New variable" }).click()],
      ["edit variable", () => page.getByRole("button", { name: "Edit @str" }).click()],
      ["settings", () => page.getByRole("button", { name: /Settings/ }).click()],
    ];
    for (const [where, open] of openers) {
      await open();
      await expect(dialog).toBeVisible();
      await expectClean(page, where);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page.locator(":focus")).not.toHaveJSProperty("tagName", "BODY");
    }

    // The delete confirmation inside a dialog.
    await page.getByRole("button", { name: "Edit attack" }).click();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expectClean(page, "confirm delete");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // The command palette, and the inline confirmation it opens for clearing the log.
    await page.getByLabel("Formula").focus();
    await page.keyboard.press("ControlOrMeta+k");
    const search = page.getByRole("combobox", { name: /Search presets/ });
    await expect(search).toBeFocused();
    await expectClean(page, "palette");
    await search.fill("clear");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Yes, clear" })).toBeFocused();
    await expectClean(page, "clear confirmation");
    await page.keyboard.press("Escape");
  });
}

test("the whole page can be tabbed through without a trap, and every stop shows focus", async ({
  page,
}) => {
  await page.goto("/");
  await populate(page);
  const seen = new Set<string>();
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const ring = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
      const path = `${el.tagName}:${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? ""}`;
      return { path, ring, matches: el.matches(":focus-visible") };
    });
    if (stop === null) continue;
    expect(stop.matches, `${stop.path} is focus-visible`).toBe(true);
    // Buttons, links and inputs must draw a ring (the tree rows draw their own highlight).
    if (!/^(DIV|LI):/.test(stop.path))
      expect(stop.ring, `${stop.path} shows a focus ring`).toBe(true);
    seen.add(stop.path);
  }
  // Tabbing wrapped round the page, so it visited more than a few stops and never got stuck.
  expect(seen.size).toBeGreaterThan(10);
});

test("reduced motion switches transitions off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("Formula").fill("2d6");
  await page.getByLabel("Formula").press("Enter");
  const longest = await page.evaluate(() =>
    Math.max(
      ...[...document.querySelectorAll("*")].flatMap((el) => {
        const s = getComputedStyle(el);
        return [s.transitionDuration, s.animationDuration]
          .join(",")
          .split(",")
          .map((d) => Number.parseFloat(d) * (d.trim().endsWith("ms") ? 1 : 1000));
      }),
    ),
  );
  expect(longest).toBeLessThan(1);
});

test.describe("unexpected errors", () => {
  const SECRET = "Gorbag the Goblin King";

  test("show a friendly notice whose copied details hold no player data", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await page.getByLabel("Formula").fill("d20+@gorbag");
    // An error out of our own code, with a message that names something of the player's.
    await page.evaluate((secret) => {
      const error = new Error(`no preset called ${secret}`);
      window.dispatchEvent(
        new ErrorEvent("error", {
          error,
          filename: `${location.origin}/assets/index.js`,
          message: error.message,
        }),
      );
    }, SECRET);

    const notice = page.getByRole("alert");
    await expect(notice).toContainText("Something went wrong");
    await expectClean(page, "error notice");
    await page.getByRole("button", { name: "Copy error details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Copied." })).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("rollin error details");
    expect(copied).toContain("Version: ");
    expect(copied).toContain("Browser: ");
    expect(copied).toContain("Error: Error");
    for (const forbidden of [SECRET, "gorbag", "d20+@", "Aria"]) {
      expect(copied.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    // The page carries on, and the notice goes away.
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(notice).toBeHidden();
    await expect(page.getByLabel("Formula")).toHaveValue("d20+@gorbag");
  });

  test("an error from somewhere else, like a browser extension, is ignored", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      for (const filename of ["chrome-extension://abc/content.js", `${location.origin}/sw.js`]) {
        window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom"), filename }));
      }
    });
    await expect(page.getByRole("alert")).toBeHidden();
  });

  test("a copy that the browser blocks selects the details instead", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined });
    });
    await page.goto("/");
    await page.evaluate(() =>
      window.dispatchEvent(
        new ErrorEvent("error", {
          error: new Error("x"),
          filename: `${location.origin}/assets/index.js`,
        }),
      ),
    );
    await page.getByRole("button", { name: "Copy error details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Couldn't copy" })).toBeVisible();
    await expect(page.getByLabel("Error details")).toBeFocused();
  });
});
