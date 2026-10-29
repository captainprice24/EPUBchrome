import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/pages.spec.ts",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve.mjs --pages",
    url: "http://127.0.0.1:4174/EPUBchrome/",
    reuseExistingServer: !process.env.CI,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/pages-results.json" }],
  ],
});
