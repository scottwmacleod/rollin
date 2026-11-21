import { expect, test } from "@playwright/test";

const dice = (faces: number[]) =>
  Object.assign(window, { __rollinDice: faces.map((face) => ({ sides: 6, face })) });

test("after one visit the app reloads and rolls with the network off, log included", async ({
  page,
  context,
}) => {
  await page.addInitScript(dice, [4, 5, 2, 3]);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await page.getByLabel("Formula").fill("2d6");
  await page.getByLabel("Formula").press("Enter");
  const log = page.getByRole("tree", { name: "Roll log" });
  await expect(log).toContainText("total 9");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open("rollin");
            open.onsuccess = () => {
              const get = open.result.transaction("kv").objectStore("kv").get("rollLog");
              get.onsuccess = () => {
                open.result.close();
                resolve(get.result !== undefined);
              };
            };
          }),
      ),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(log).toContainText("total 9");

  await page.getByLabel("Formula").fill("2d6");
  await page.getByLabel("Formula").press("Enter");
  await expect(log.getByRole("treeitem")).toHaveCount(2);
});

test("serves a web app manifest with installable icons", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(href ?? "")).json();
  expect(manifest).toMatchObject({ name: "rollin", display: "standalone", start_url: "/" });
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
});

test("a new deploy shows an update prompt, and reloading picks it up", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.getByText("A new version of rollin is ready.")).toHaveCount(0);
  await page.evaluate(() => Object.assign(window, { sameLoad: true }));

  await page.evaluate(() => navigator.serviceWorker.register("/sw.js?next"));

  await expect(page.getByText("A new version of rollin is ready.")).toBeVisible();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Reload to update" }).click(),
  ]);
  expect(await page.evaluate(() => "sameLoad" in window)).toBe(false);
});
