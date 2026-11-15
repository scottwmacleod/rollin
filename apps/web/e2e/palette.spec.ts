import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const log = (page: import("@playwright/test").Page) => page.getByRole("tree", { name: "Roll log" });

test("a whole session runs from the keyboard, with the palette and completion", async ({
  page,
}) => {
  await page.addInitScript(() => Object.assign(window, { __rollinDice: [{ sides: 20, face: 9 }] }));
  await page.goto("/");
  const formula = page.getByRole("combobox", { name: "Formula" });
  await expect(formula).toBeFocused();

  // Ctrl+K opens the palette from the formula box; Esc closes it and gives focus back.
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  const search = palette.getByRole("combobox");
  await expect(search).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(formula).toBeFocused();

  // Make a character with a variable, then a preset that uses it, all from the palette.
  await page.keyboard.press("Control+k");
  await search.fill("new char");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("mira");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /^mira/ })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Control+k");
  await search.fill(">new var");
  await page.keyboard.press("Enter");
  await dialog.getByLabel("Name").fill("str");
  await dialog.getByLabel("Value").fill("4");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();

  await formula.fill("d20+@s");
  const list = page.getByRole("listbox", { name: "Completions" });
  await expect(list.getByRole("option")).toHaveText(["@str"]);
  await expect(await new AxeBuilder({ page }).analyze()).toHaveProperty("violations", []);
  await page.keyboard.press("Tab");
  await expect(formula).toHaveValue("d20+@str");
  await expect(list).toBeHidden();

  await page.keyboard.press("Control+k");
  await search.fill("new preset");
  await page.keyboard.press("Enter");
  await expect(dialog.getByLabel("Formula")).toHaveValue("d20+@str");
  await dialog.getByLabel("Name").fill("attack");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();

  // The preset completes by name, and rolls from the palette too.
  await formula.fill("att");
  await expect(list.getByRole("option")).toHaveText(["attack"]);
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(formula).toBeFocused();
  await formula.fill("");
  await page.keyboard.press("Control+k");
  await search.fill("attack");
  await page.keyboard.press("Enter");
  await expect(log(page)).toContainText("attack · d20+@str");
  await expect(log(page)).toContainText("total 13");
  await expect(formula).toBeFocused();

  // Switching character, settings, and clearing the log are all in the palette.
  await page.keyboard.press("Control+k");
  await search.fill("@def");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^default/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.keyboard.press("Control+k");
  await search.fill("settings");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.keyboard.press("Control+k");
  await search.fill("clear roll");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Yes, clear" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(log(page)).toBeHidden();
});

test("the palette is fuzzy, scoped by @ and >, and says when nothing matches", async ({ page }) => {
  await page.goto("/");
  // The app has mounted once the formula box has focus; the shortcut is live from then.
  await expect(page.getByRole("combobox", { name: "Formula" })).toBeFocused();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  const search = palette.getByRole("combobox");
  await search.fill("nwc");
  await expect(palette.getByRole("option")).toHaveText(["New character…"]);
  await search.fill("@");
  await expect(palette.getByRole("option")).toHaveText(["defaultactive"]);
  await search.fill("zzzz");
  await expect(palette).toContainText("Nothing matches.");
  await search.fill("");
  await expect(palette.getByRole("option", { name: "Clear roll log" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("Enter rolls when no completion was chosen with the arrow keys", async ({ page }) => {
  await page.goto("/");
  const formula = page.getByRole("combobox", { name: "Formula" });
  await page.getByRole("button", { name: "Save as preset" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("stab");
  await dialog.getByLabel("Formula").fill("d6");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await formula.fill("sta");
  await expect(page.getByRole("option", { name: "stab" })).toBeVisible();
  await formula.press("Enter");
  await expect(log(page)).toContainText("is not a valid formula or a known preset");
  await formula.fill("sta");
  await formula.press("ArrowDown");
  await formula.press("Enter");
  await expect(formula).toHaveValue("stab");
});
