// Apply pending migrations (idempotent via the _migrations ledger).
//
// Usage:
//   node database/scripts/apply-migration.mjs                  -> applies every
//     *.sql file in database/migrations/, in filename order, that is not yet
//     recorded in the _migrations ledger. This is the normal build-time mode:
//     adding a new numbered migration file is enough, nothing else to wire up.
//   node database/scripts/apply-migration.mjs 0059_learner_record.sql
//     -> applies just that one file (kept for manual/one-off use).
//
// Historical note: this used to take a single hardcoded filename, which meant
// every new migration had to be added by hand to the build:migrate npm
// script or it would silently never run against production. Scanning the
// migrations directory removes that failure mode.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const explicitFile = process.argv[2];
if (!process.env.DATABASE_URL) {
  console.log("[apply-migration] skipped (no DATABASE_URL)");
  process.exit(0);
}

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));
const files = explicitFile
  ? [explicitFile]
  : readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await c.connect();
  await c.query("create table if not exists _migrations (filename text primary key, applied_at timestamptz not null default now())");

  for (const file of files) {
    try {
      const done = await c.query("select 1 from _migrations where filename=$1", [file]);
      if (done.rowCount) {
        console.log(`[apply-migration] ${file} already applied`);
        continue;
      }
      const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
      await c.query("begin");
      await c.query(sql);
      await c.query("insert into _migrations (filename) values ($1)", [file]);
      await c.query("commit");
      console.log(`[apply-migration] applied ${file}`);
    } catch (e) {
      try { await c.query("rollback"); } catch {}
      if (e.code === "42P07") {
        // Table already exists (migration was applied by hand) -> just record it in the ledger.
        await c.query("insert into _migrations (filename) values ($1) on conflict do nothing", [file]);
        console.log(`[apply-migration] ${file} already present in database; recorded in ledger`);
        continue;
      }
      console.log(`[apply-migration] FAILED (${file}):`, e.message); // never block the deploy
    }
  }
} catch (e) {
  console.log("[apply-migration] FAILED:", e.message);
} finally {
  await c.end().catch(() => {});
}
process.exit(0); // never block the deploy
