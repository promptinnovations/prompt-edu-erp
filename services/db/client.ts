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
  const { Pool, types } = await import("pg");
  // node-postgres parses `date`/`timestamp`/`timestamptz` columns into JS
  // Date objects by default — PGlite (the adapter every integration test
  // runs against, see createPgliteAdapter() below) does NOT do this, it
  // returns the raw string Postgres sends. Every service interface in this
  // codebase declares these fields `string` (e.g. LeaveApplicationRecord.
  // start_date), so a Date object silently satisfies TypeScript at compile
  // time but crashes the first time something renders it directly in JSX
  // ("Objects are not valid as a React child (found: [object Date])") —
  // found live on /staff (StaffLeaveSection rendering leave_applications.
  // start_date/end_date) after 341 passing tests never caught it, exactly
  // because PGlite already agreed with the `string` type. Overriding these
  // three OIDs to the identity function makes both adapters behave
  // identically, for every current and future date/timestamp column, not
  // just the one that happened to crash first.
  types.setTypeParser(types.builtins.DATE, (val) => val);
  types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
  types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);

  // §Perf: pg's defaults (max 10, 10s idle timeout) made a busy page queue
  // for connections and made the first request after any 10s lull pay a
  // fresh TLS + auth handshake to Supabase. Keep connections warm longer,
  // allow a few more, and fail fast instead of hanging if the DB is
  // unreachable. DB_POOL_MAX lets production tune it to the plan's limit.
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX) || 15,
    idleTimeoutMillis: 120_000,
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
  });

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
        // Role + every tenant setting in ONE round trip (was 5+).
        const sc = sessionContextQuery(ctx);
        await client.query(sc.sql, sc.params);
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
        const sc = sessionContextQuery(ctx);
        await db.query(sc.sql, sc.params);
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

/** One statement that switches to the RLS-bound `app_user` role and sets
 *  every tenant setting for the current transaction.
 *
 *  `set_config(..., true)` = transaction-local (same as `set local`). The
 *  old code passed `false`, which is SESSION-level despite its comment: the
 *  values outlived the transaction and stayed on the pooled connection
 *  for whichever request borrowed it next — harmless only because every
 *  transaction overwrote all three, and incompatible with a transaction
 *  pooler (Supabase Supavisor :6543). `set_config('role', …, true)` is
 *  exactly `set local role`. */
export function sessionContextQuery(
  ctx: { institutionId: string | null; authUserId?: string | null; isSuperAdmin?: boolean; flags?: Record<string, boolean> }
): { sql: string; params: unknown[] } {
  const params: unknown[] = [ctx.institutionId ?? "", ctx.authUserId ?? "", ctx.isSuperAdmin ? "true" : "false"];
  const parts = [
    "set_config('role', 'app_user', true)",
    "set_config('app.current_institution_id', $1, true)",
    "set_config('app.current_auth_user_id', $2, true)",
    "set_config('app.is_super_admin', $3, true)",
  ];
  for (const [flag, value] of Object.entries(ctx.flags ?? {})) {
    params.push(`app.${flag}`, value ? "true" : "false");
    parts.push(`set_config($${params.length - 1}, $${params.length}, true)`);
  }
  return { sql: `select ${parts.join(", ")}`, params };
}
