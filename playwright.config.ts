import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  expect: { timeout: 5000 },
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:5310",
    browserName: "chromium",
    channel: process.env["PLAYWRIGHT_CHANNEL"] || undefined,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1365, height: 950 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:5310/data",
    reuseExistingServer: false,
    timeout: 15000,
  },
});
