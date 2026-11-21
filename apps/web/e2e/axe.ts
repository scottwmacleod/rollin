import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export async function axe(page: Page): Promise<AxeBuilder> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  return new AxeBuilder({ page });
}
