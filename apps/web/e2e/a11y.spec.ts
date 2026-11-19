import { expect, type Page, test } from "@playwright/test";
import { axe } from "./axe";

const log = (page: Page) => page.getByRole("tree", { name: "Roll log" });

async function expectClean(page: Page, where: string) {
  const { violations } = await (await axe(page)).analyze();
  expect(
    violations.map(
      (v) => `${where}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target).join(" ")}`,
    ),
  ).toEqual([]);
}

/**
 * Every visible control border (buttons, fields, chips) must reach 3:1 against
 * what's behind it (WCAG 1.4.11). The old `line-strong` borders were 1.64:1.
 */
async function expectControlBorders(page: Page, where: string) {
  const weak = await page.evaluate(() => {
    type RGBA = [number, number, number, number];
    const parse = (c: string): RGBA => {
      const n = c.match(/[\d.]+/g)?.map(Number) ?? [];
      return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
    };
    const over = (top: RGBA, under: RGBA): RGBA => {
      const a = top[3];
      return [0, 1, 2].map((i) => (top[i] ?? 0) * a + (under[i] ?? 0) * (1 - a)).concat(1) as RGBA;
    };
    const lum = (c: RGBA) =>
      [0, 1, 2]
        .map((i) => {
          const s = (c[i] ?? 0) / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const behind = (el: Element): RGBA => {
      const layers: RGBA[] = [];
      for (let e: Element | null = el.parentElement; e; e = e.parentElement) {
        const bg = parse(getComputedStyle(e).backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] === 1) break;
      }
      return layers.reduceRight((under, top) => over(top, under), [255, 255, 255, 1] as RGBA);
    };
    const out: string[] = [];
    const controls = document.querySelectorAll(
      "button, a[href], textarea, select, input:not([type=radio]):not([type=checkbox]):not([type=hidden])",
    );
    for (const el of controls) {
      const s = getComputedStyle(el);
      if (!(el as HTMLElement).checkVisibility?.() || s.borderTopStyle === "none") continue;
      if (Number.parseFloat(s.borderTopWidth) === 0) continue;
      const border = parse(s.borderTopColor);
      if (border[3] === 0) continue;
      const back = behind(el);
      const a = lum(over(border, back));
      const b = lum(back);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 3) {
        const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30);
        out.push(`${el.tagName} "${name}" border ${ratio.toFixed(2)}:1`);
      }
    }
    return out;
  });
  expect(weak, `${where}: control borders under 3:1`).toEqual([]);
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
    await expectControlBorders(page, "populated page");

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
      await expectControlBorders(page, where);
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
    await expectControlBorders(page, "palette");
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
      // The ring is signal-ink: resolve the token to the same colour format as outlineColor.
      const probe = document.createElement("span");
      probe.style.color = "var(--sm-signal-ink)";
      document.body.append(probe);
      const signalInk = getComputedStyle(probe).color;
      probe.remove();
      const signal = style.outlineColor === signalInk;
      return { path, ring, signal, matches: el.matches(":focus-visible") };
    });
    if (stop === null) continue;
    expect(stop.matches, `${stop.path} is focus-visible`).toBe(true);
    // Buttons, links and inputs must draw a ring (the tree rows draw their own highlight).
    if (!/^(DIV|LI):/.test(stop.path)) {
      expect(stop.ring, `${stop.path} shows a focus ring`).toBe(true);
      expect(stop.signal, `${stop.path} rings in signal-ink`).toBe(true);
    }
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
