import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.STORYVERSE_E2E_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "outputs/playwright-artifacts",
  fullyParallel: false,
  timeout: 90_000,
  actionTimeout: 15_000,
  navigationTimeout: 30_000,
  expect: { timeout: 12_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Local Supabase Auth and the Edge runtime are intentionally exercised in
  // sequence. Parallel account creation can hit local gateway startup races
  // and makes a failed journey harder to diagnose.
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "outputs/playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "outputs/playwright-report", open: "never" }]],
  use: {
    baseURL,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npm run dev:local",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      STORYVERSE_DEV_PORT: String(port),
      STORYVERSE_FUNCTIONS_ENV_FILE: process.env.STORYVERSE_FUNCTIONS_ENV_FILE || "supabase/functions/.env.local",
    },
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /responsive\.spec\.ts/,
    },
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
});
