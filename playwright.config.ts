/**
 * PROMPT EDU ERP — Playwright e2e config (§AC follow-up: "no browser
 * automation exercises the actual React forms yet", docs/SETUP.md).
 *
 * These tests drive a REAL running `next dev` server against a REAL,
 * disposable, file-backed PGlite database (see services/db/client.ts's own
 * doc comment) — no Docker, no external Postgres/Supabase account needed.
 * `global-setup.ts` wipes and re-migrates+seeds a dedicated data directory
 * (database/.e2e-pglite-data, gitignored) before the suite runs, and
 * `global-teardown.ts` removes it afterward so the suite is idempotent.
 *
 * The webServer's env deliberately BLANKS OUT any Supabase credentials
 * inherited from .env.local (NEXT_PUBLIC_SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL) — Next.js's dotenv loader skips
 * a key that already exists in the child process's env (even if set to an
 * empty string), so an explicit "" here reliably wins over whatever
 * .env.local defines. This forces getAuthService() (services/auth/
 * auth-service.ts) to select DevAuthProvider, exactly like a fresh
 * `npm run dev` with no Supabase project configured — real Supabase Auth
 * itself cannot be exercised in an automated test without a live project
 * (see docs/SECURITY.md's own note on that), so these tests cover
 * everything BELOW that boundary: real HTML forms, real server actions,
 * real Postgres (via PGlite) round trips, real RLS-scoped queries.
 */
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export const E2E_DATA_DIR = path.join(__dirname, "database", ".e2e-pglite-data");
export const E2E_PORT = 3100;
const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: require.resolve("./tests/e2e/global-setup.ts"),
  globalTeardown: require.resolve("./tests/e2e/global-teardown.ts"),
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${E2E_PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PGLITE_DATA_DIR: E2E_DATA_DIR,
      DATABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      ALLOW_DEV_AUTH: "",
      NODE_ENV: "development",
    },
  },
});
