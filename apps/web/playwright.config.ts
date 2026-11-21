import { defineConfig, devices } from "@playwright/test";

const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] }
  : {};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "off" },
  projects: [
    {
      name: "chromium",
      testIgnore: ["phone.spec.ts", "narrow.spec.ts", "tiny.spec.ts"],
      use: { ...devices["Desktop Chrome"], launchOptions },
    },
    {
      name: "narrow",
      testMatch: "narrow.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 700, height: 800 }, launchOptions },
    },
    {
      name: "tiny",
      testMatch: "tiny.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 400, height: 800 }, launchOptions },
    },
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
      "bun run build:e2e && bun --bun vite preview --outDir dist-e2e --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
