import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * An axe run that waits for finite animations first, such as a new roll's
 * 150ms fade-in, so colours are read at rest and not mid-fade.
 */
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
