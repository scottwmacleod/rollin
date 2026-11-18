import { defineConfig, devices } from "@playwright/test";

const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] }
  : {};

// Tests run against a test build (`--mode e2e`, which lets a test script the dice),
// served by `vite preview`.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // sm_ conventions: a test that needs a retry has a bug.
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "off" },
  projects: [
    {
      name: "chromium",
      testIgnore: ["phone.spec.ts", "narrow.spec.ts", "tiny.spec.ts"],
      use: { ...devices["Desktop Chrome"], launchOptions },
    },
    // A narrow desktop window: under 768px wide, with a mouse, so the keypad stays off under Auto.
    {
      name: "narrow",
      testMatch: "narrow.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 700, height: 800 }, launchOptions },
    },
    // A very narrow desktop window (about 400px): phone arrangement, mouse, no touch.
    {
      name: "tiny",
      testMatch: "tiny.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 400, height: 800 }, launchOptions },
    },
    // Phones run on Chromium with each phone's screen, touch and user agent, so CI
    // needs no WebKit download. The iPhone's own browser engine is not covered.
    {
      name: "iphone",
      testMatch: "phone.spec.ts",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", launchOptions },
    },
    {
      name: "android",
      testMatch: "phone.spec.ts",
      use: { ...devices["Pixel 7"], launchOptions },
    },
  ],
  webServer: {
    command:
      "npm run build:e2e && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
