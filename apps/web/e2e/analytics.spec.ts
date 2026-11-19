import { expect, test } from "@playwright/test";

test("rolls as usual with PostHog blocked, and no error reaches the page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/_sm/**", (route) => route.abort());
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [
        { sides: 6, face: 4 },
        { sides: 6, face: 5 },
      ],
    }),
  );

  // The first key press makes the loader ask for PostHog's script, which is blocked.
  const blocked = page.waitForEvent("requestfailed", (r) =>
    r.url().includes("/_sm/static/array.js"),
  );
  await page.goto("/");
  await page.getByLabel("Formula").fill("2d6");
  await blocked;
  await page.getByLabel("Formula").press("Enter");

  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText("total 9");
  expect(errors).toEqual([]);
});
