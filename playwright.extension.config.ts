import { defineConfig } from "@playwright/test";
// Loads the built extension itself, unlike the main suite, which serves the
// same files over HTTP. Needs a full Chromium build; run `npm run build` first.
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/extension.spec.ts",
  timeout: 60000,
  workers: 1,
  reporter: [["list"]],
});
