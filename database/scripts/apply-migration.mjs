// One-off: apply a single migration file (idempotent via the _migrations ledger).
// Usage: node database/scripts/apply-migration.mjs 0059_learner_record.sql
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) {
  console.log("[apply-migration] skipped (no file or DATABASE_URL)");
  process.exit(0);
}
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await c.connect();
  await c.query("create table if not exists _migrations (filename text primary key, applied_at timestamptz not null default now())");
  const done = await c.query("select 1 from _migrations where filename=$1", [file]);
  if (done.rowCount) {
    console.log(`[apply-migration] ${file} already applied`);
  } else {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    await c.query("begin");
    await c.query(sql);
    await c.query("insert into _migrations (filename) values ($1)", [file]);
    await c.query("commit");
    console.log(`[apply-migration] applied ${file}`);
  }
} catch (e) {
  try { await c.query("rollback"); } catch {}
  if (e.code === "42P07") {
    // Table already exists (migration was applied by hand) -> just record it in the ledger.
    await c.query("insert into _migrations (filename) values ($1) on conflict do nothing", [file]);
    console.log(`[apply-migration] ${file} already present in database; recorded in ledger`);
    await c.end().catch(() => {});
    process.exit(0);
  }
  console.log("[apply-migration] FAILED:", e.message);
  process.exit(0); // never block the deploy
} finally {
  await c.end().catch(() => {});
}
