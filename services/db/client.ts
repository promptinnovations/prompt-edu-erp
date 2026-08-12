/**
 * PROMPT EDU ERP — Database client abstraction (ARCHITECTURE.md §A.3 "database
 * access is the only layer allowed to run SQL", §V "PostgreSQL portability").
 *
 * Two backends implement the same minimal interface:
 *   - PgAdapter     — node-postgres, used when DATABASE_URL is set
 *                      (Supabase Postgres today, Neon or any Postgres later —
 *                      §V — no code above this file changes on migration)
 *   - PgliteAdapter — an embedded, file-persisted Postgres (WASM), used when
 *                      DATABASE_URL is NOT set, so the whole platform (schema,
 *                      RLS, seed data, tenant-isolation tests) runs locally
 *                      with zero external infrastructure. This is a dev/test
 *                      convenience only — production always sets DATABASE_URL.
 *
 * Every tenant-scoped query MUST go through `withInstitutionContext`, which
 * sets the Postgres session variables that the RLS policies in
 * database/migrations/0001_foundation.sql key off (§E.1/§E.2). Server code
 * must never build a "trust me, this row belongs to institution X" query
 * without this — RLS is the second, independent gate.
 *
 * `query()` uses parameterized/prepared execution (for application code —
 * one statement at a time, safe against injection). `execRaw()` uses the
 * simple query protocol (for migration/seed .sql files that may contain
 * multiple ;-separated statements and PL/pgSQL blocks) — never used with
 * untrusted/user-supplied input.
 */

export interface DbClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execRaw(sql: string): Promise<void>;
  withInstitutionContext<T>(
    ctx: { institutionId: string | null; authUserId?: string | null; isSuperAdmin?: boolean; flags?: Record<string, boolean> },
    fn: (client: DbClient) => Promise<T>
  ): Promise<T>;
  close(): Promise<void>;
}

let cachedClient: DbClient | null = null;

/** Test-only: force the next getDbClient() call to construct a fresh
 * adapter. Needed because integration test FILES each want their own
 * isolated database (via a fresh PGLITE_DATA_DIR), but vitest's process/
 * worker pools may reuse the same OS process across multiple test files —
 * this module-level singleton would otherwise silently leak the first
 * file's already-open database into a later file's tests. */
export function __resetDbClientForTests() {
  cachedClient = null;
}

export async function getDbClient(): Promise<DbClient> {
  if (cachedClient) return cachedClient;

  // Read lazily (not as a module-level constant) — ESM hoists static
  // `import` statements above any other top-level code in an importing
  // file, so a test file's `process.env.PGLITE_DATA_DIR = ...` assignment
  // would otherwise run AFTER this module has already been evaluated,
  // silently falling back to the on-disk default and bleeding state across
  // test files/runs. Reading it here, at call time, avoids that trap.
  const DATA_DIR = process.env.PGLITE_DATA_DIR ?? "./database/.pglite-data";

  if (process.env.DATABASE_URL) {
    cachedClient = await createPgAdapter(process.env.DATABASE_URL);
  } else if (DATA_DIR === ":memory:") {
    // Sentinel used by integration tests (see tests/integration/*) to get a
    // genuinely isolated, in-memory PGlite instance through the SAME
    // getDbClient() singleton that module services call internally —
    // avoids a real observed issue where multiple FILE-BACKED PGlite
    // instances created in sequence within one Node process can bleed
    // state into each other even with different data directories.
    cachedClient = await createPgliteAdapter(undefined);
  } else {
    cachedClient = await createPgliteAdapter(DATA_DIR);
  }
  return cachedClient;
}

// Test-only: force a fresh, isolated client (used by the tenant-isolation
// integration tests so each test run gets its own in-memory database).
export async function createIsolatedTestClient(): Promise<DbClient> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(); // in-memory, no dataDir => throwaway
  return wrapPglite(db);
}

// ---------------------------------------------------------------------------
// node-postgres adapter (real Postgres — Supabase / Neon / self-hosted)
// ---------------------------------------------------------------------------
async function createPgAdapter(connectionString: string): Promise<DbClient> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString });

  const adapter: DbClient = {
    async query(sql, params = []) {
      const res = await pool.query(sql, params as unknown[]);
      return { rows: res.rows as never[] };
    },
    async execRaw(sql) {
      await pool.query(sql);
    },
    async withInstitutionContext(ctx, fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("set local role app_user");
        await applySessionContext(
          (sql: string, params: unknown[]) => client.query(sql, params).then((r) => ({ rows: r.rows })),
          ctx
        );
        const scoped: DbClient = {
          query: (sql, params = []) => client.query(sql, params as unknown[]).then((r) => ({ rows: r.rows as never[] })),
          execRaw: (sql) => client.query(sql).then(() => undefined),
          withInstitutionContext: adapter.withInstitutionContext,
          close: adapter.close,
        };
        const result = await fn(scoped);
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
  return adapter;
}

// ---------------------------------------------------------------------------
// PGlite adapter (embedded Postgres — local dev/test, no Docker/root needed)
// ---------------------------------------------------------------------------
async function createPgliteAdapter(dataDir: string | undefined): Promise<DbClient> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = dataDir ? new PGlite(dataDir) : new PGlite(); // undefined => in-memory
  return wrapPglite(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapPglite(db: any): DbClient {
  const adapter: DbClient = {
    async query(sql, params = []) {
      const res = await db.query(sql, params as unknown[]);
      return { rows: res.rows as never[] };
    },
    async execRaw(sql) {
      await db.exec(sql);
    },
    async withInstitutionContext(ctx, fn) {
      await db.exec("begin");
      try {
        await db.exec("set local role app_user");
        await applySessionContext((sql: string, params: unknown[]) => db.query(sql, params).then((r: { rows: unknown[] }) => ({ rows: r.rows })), ctx);
        const result = await fn(adapter);
        await db.exec("commit");
        return result;
      } catch (err) {
        await db.exec("rollback");
        throw err;
      }
    },
    async close() {
      await db.close();
    },
  };
  return adapter;
}

async function applySessionContext(
  run: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>,
  ctx: { institutionId: string | null; authUserId?: string | null; isSuperAdmin?: boolean; flags?: Record<string, boolean> }
) {
  // set_config(..., false) => visible for the rest of the current transaction,
  // which is exactly the lifetime we want (one request = one transaction).
  await run("select set_config('app.current_institution_id', $1, false)", [ctx.institutionId ?? ""]);
  await run("select set_config('app.current_auth_user_id', $1, false)", [ctx.authUserId ?? ""]);
  await run("select set_config('app.is_super_admin', $1, false)", [ctx.isSuperAdmin ? "true" : "false"]);
  for (const [flag, value] of Object.entries(ctx.flags ?? {})) {
    await run(`select set_config($1, $2, false)`, [`app.${flag}`, value ? "true" : "false"]);
  }
}
