import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 30000,
    // Every integration suite applies the WHOLE migration ledger in its
    // beforeAll against a fresh in-memory PGlite, so that hook gets slower
    // with every migration added -- several suites tipped past vitest's
    // 10s hook default the moment migration 0049 landed, with nothing
    // actually wrong with them. Matched to testTimeout above, which was
    // raised for exactly the same reason.
    hookTimeout: 30000,
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
