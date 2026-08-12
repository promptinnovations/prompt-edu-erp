/**
 * PROMPT EDU ERP — e2e global teardown. Removes the disposable e2e PGlite
 * data directory so repeated `npm run test:e2e` runs are idempotent and
 * nothing e2e-specific is left behind in the working tree.
 */
import { rmSync } from "node:fs";
import { E2E_DATA_DIR } from "../../playwright.config";

export default function globalTeardown() {
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
}
