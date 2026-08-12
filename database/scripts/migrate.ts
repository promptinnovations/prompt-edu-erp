/**
 * PROMPT EDU ERP — migration runner.
 *
 * Migrations run as the privileged/owner database connection (the same
 * connection any Postgres migration tool uses), which is why they do NOT go
 * through withInstitutionContext/app_user (§E.1 note in
 * database/migrations/0002_app_runtime_role.sql — table owners and
 * superusers are exempt from RLS by Postgres design; migrations rely on
 * exactly that to create/alter schema). All actual application request
 * traffic instead goes through withInstitutionContext, which runs as the
 * unprivileged `app_user` role and is fully subject to RLS.
 *
 * Applies every .sql file in database/migrations, in filename order, tracked
 * in a `_migrations` ledger table so re-running is idempotent.
 *
 * Usage: npm run db:migrate   (uses DATABASE_URL if set, else local PGlite)
 * Also exported as applyMigrations(db) so tests can run it against an
 * isolated in-memory database (see tests/integration/tenant-isolation.test.ts).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DbClient } from "../../services/db/client";
import { getDbClient } from "../../services/db/client";

const MIGRATIONS_DIR = join(process.cwd(), "database", "migrations");

export async function applyMigrations(db: DbClient) {
  await db.execRaw(`
    create table if not exists _migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: applied } = await db.query<{ filename: string }>("select filename from _migrations");
  const appliedSet = new Set(applied.map((r) => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await db.execRaw(sql);
    await db.query("insert into _migrations (filename) values ($1)", [file]);
  }
  return { total: files.length, applied: files.length - appliedSet.size };
}

async function main() {
  const db = await getDbClient();
  const result = await applyMigrations(db);
  console.log(`Migrations complete. ${result.total} file(s) checked, ${result.applied} applied.`);
  await db.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
