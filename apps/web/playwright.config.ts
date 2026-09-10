import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "CI=true npx --yes pnpm@10.25.0 predev && CI=true PIPHACKLUP_UI_TEST_MODE=1 npx --yes pnpm@10.25.0 exec next dev",
    url: "http://localhost:3000/dashboard",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
