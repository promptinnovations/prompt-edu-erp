import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 30000,
    // tests/e2e/**/*.spec.ts are Playwright specs (see playwright.config.ts)
    // — they import "@playwright/test", not vitest, and must never be
    // picked up by `npm test`'s default *.spec.ts glob.
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
