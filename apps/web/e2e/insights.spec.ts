import { expect, test } from "@playwright/test";

for (const [name, path] of [
  ["Web Analytics", "/_vercel/insights/script.js"],
  ["Speed Insights", "/_vercel/speed-insights/script.js"],
] as const) {
  test(`${name} loads one deferred same-origin script and sets no cookie`, async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.getByLabel("Formula")).toBeVisible();
    const scripts = page.locator(`script[src="${path}"]`);
    await expect(scripts).toHaveCount(1);
    expect(await scripts.evaluate((s: HTMLScriptElement) => s.defer)).toBe(true);
    expect(await context.cookies()).toEqual([]);
  });
}
