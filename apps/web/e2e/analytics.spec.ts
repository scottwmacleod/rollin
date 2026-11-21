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

test("a roll sends one dice_rolled event with counts only, never the formula or result", async ({
  page,
}) => {
  await page.route("**/_sm/**", (route) => route.abort());
  await page.addInitScript(() =>
    Object.assign(window, {
      __rollinDice: [
        { sides: 6, face: 4 },
        { sides: 6, face: 5 },
        { sides: 20, face: 11 },
      ],
    }),
  );
  await page.goto("/");
  await page.getByLabel("Formula").fill("2d6+d20");
  await page.getByLabel("Formula").press("Enter");
  await expect(page.getByRole("tree", { name: "Roll log" })).toContainText("total 20");

  const queued = await page.evaluate(() =>
    (window as unknown as { posthog: unknown[][] }).posthog.filter((c) => c[0] === "capture"),
  );
  expect(queued).toEqual([["capture", "dice_rolled", { dice: 3, sides: [6, 20], from: "input" }]]);
});
