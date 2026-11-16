import { defineConfig } from "vitest/config";
// Pure modules only. Behaviour that needs a browser is covered by the
// Playwright suites in tests/*.spec.ts.
export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
