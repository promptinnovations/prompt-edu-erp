/**
 * PROMPT EDU ERP — e2e global setup (see playwright.config.ts's own doc
 * comment for the overall design). Runs BEFORE the webServer starts:
 * wipes any stale e2e database directory, then runs the same
 * `db:migrate`/`db:seed` scripts a real developer runs by hand (see
 * docs/SETUP.md's Quickstart), pointed at the dedicated e2e data dir, with
 * SEED_DEMO_INSTITUTION + SEED_SUPER_ADMIN so both demo dev-login accounts
 * (admin@badrudhuja.example, root@prompt-innovations.example) exist before
 * any test runs.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { E2E_DATA_DIR } from "../../playwright.config";

export default function globalSetup() {
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });

  const env = {
    ...process.env,
    PGLITE_DATA_DIR: E2E_DATA_DIR,
    DATABASE_URL: "",
    SEED_DEMO_INSTITUTION: "true",
    SEED_SUPER_ADMIN: "true",
  };

  execFileSync("npx", ["tsx", "database/scripts/migrate.ts"], { stdio: "inherit", env });
  execFileSync("npx", ["tsx", "database/scripts/seed.ts"], { stdio: "inherit", env });
}
