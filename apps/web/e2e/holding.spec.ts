import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const scheme of ["light", "dark"] as const) {
  test(`holding page is branded and accessible in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "rollin" })).toBeVisible();
    await expect(page.getByText("The web app is on its way.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Follow progress on GitHub" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
