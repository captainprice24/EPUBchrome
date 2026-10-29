import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/pages.spec.ts",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/reader-results.json" }],
  ],
});
