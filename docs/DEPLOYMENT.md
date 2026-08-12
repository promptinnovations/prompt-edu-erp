# Deployment

This covers taking PROMPT EDU ERP from local development to a real
production deployment: environment setup, the backup/disaster-recovery
runbook required by `ARCHITECTURE.md` §X.3, and a concrete go-live
checklist. `docs/SETUP.md` covers local development and connecting a real
Supabase project; read that first if you haven't already. `docs/
SECURITY.md` covers the application-layer security controls this
checklist assumes exist.

## Prerequisites

- A real Postgres database (Supabase recommended for v1 — `DATABASE_URL` +
  Supabase Auth/Storage credentials; see `docs/SETUP.md`'s "Connecting a
  real Supabase project"). Neon or self-hosted Postgres also work — the
  entire app talks to Postgres only through `services/db/client.ts`'s
  `PgAdapter` (§V), so switching providers is a connection-string change,
  not a rewrite.
- Node.js 20+ (matches `.github/workflows/ci.yml`'s CI runner).
- A hosting target that runs Next.js's Node runtime with middleware support
  (Vercel is the reference target; any Node host that supports Next.js 15
  middleware works).

## Build & release

```bash
npm ci
npm run verify      # typecheck, lint, secret-leak check, full test suite
npm run build
npm run db:migrate  # idempotent — safe to run on every deploy (§ tracked in _migrations)
npm start
```

`npm run verify` is exactly what CI runs (`.github/workflows/ci.yml`) —
running it locally before a deploy catches the same class of issue CI
would, without waiting on a pipeline.

## Environment variables

See `.env.example` for the full, commented list. At minimum, a real
deployment needs:

- `DATABASE_URL` — real Postgres connection string.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — switches `AuthService` to
  `SupabaseAuthProvider` and `StorageProvider` to `SupabaseStorageProvider`
  simultaneously (both read the same two vars — see `docs/SETUP.md`).
- `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM` — real email
  delivery via `SmtpEmailProvider`; omit to keep notifications logged to
  console only (fine for staging, not for production).
- Do **not** set `ALLOW_DEV_AUTH=true` in production — `services/auth/
  auth-service.ts` hard-blocks `DevAuthProvider` in `NODE_ENV=production`
  unless this is explicitly set, specifically so it can't be enabled by
  accident.
- `MAX_UPLOAD_BYTES` — optional, overrides the 10 MB default file-upload
  cap (`services/storage/file-service.ts`).

## Backup & disaster recovery (§X.3)

**This section is a runbook template.** The specific RTO/RPO numbers,
backup cadence, and restore-drill schedule below are placeholders to be
filled in once real production hosting/Supabase tier is actually selected
— they cannot be meaningfully finalized from within this repository alone,
since they depend on which Supabase plan (or alternative host) is chosen.
Update this section (not `ARCHITECTURE.md`) once that decision is made.

### Database

- **Backup mechanism**: Supabase's built-in daily backups (Point-in-Time
  Recovery on paid tiers) is the recommended default — no custom cron job
  needed if using Supabase. If self-hosting Postgres instead, schedule
  `pg_dump`/WAL-archiving on a real cron (not built into this
  application — infrastructure-level, outside `npm run` scripts).
- **Retention**: _[fill in once a plan/tier is selected — Supabase's free
  tier has no PITR; paid tiers vary by retention window]_.
- **RTO (Recovery Time Objective)**: _[fill in — depends on hosting tier
  and whether a warm standby is provisioned]_.
- **RPO (Recovery Point Objective)**: _[fill in — depends on backup
  frequency/PITR granularity]_.
- **Restore drill**: a backup that has never been restored is not a
  verified backup. Schedule a periodic (e.g. quarterly) restore of the
  latest backup into a scratch environment, then run `npm run db:migrate`
  against it and spot-check `tests/integration/tenant-isolation.test.ts`-
  style queries manually to confirm RLS and data are intact. Record the
  date/result of each drill here once performed.

### File storage

- **Local provider** (`.local-storage/`): NOT backed up by this
  application — only appropriate for local dev/test, never production (see
  `docs/SETUP.md`). A production deployment should be running the
  Supabase (or a future Google Drive) provider, whose own storage
  durability/versioning applies.
- **Supabase Storage provider**: durability follows Supabase's own bucket
  storage guarantees; enable bucket-level backup/versioning through the
  Supabase dashboard if the plan supports it (not something this
  application configures programmatically today).

### What is NOT backed up automatically today

- Anything the local embedded database (PGlite, `database/.pglite-data/`)
  holds — that path is dev/test-only by design (§V) and is never used in
  production (`DATABASE_URL` unset would mean this hasn't been configured
  for prod at all — treat that as a deployment-blocking misconfiguration,
  not a valid production state).

## Monitoring

Built in today:

- **Audit logs** (`audit_logs`, `platform_audit_logs`) — a full record of
  who changed what, viewable via `/reports` (institution `audit.view`
  permission) and `/super-admin/audit` (platform-wide).
- **Usage overview** (`/super-admin`) — live per-institution counts
  (students, staff, users, files). Not the scheduled `usage_metrics`
  rollup described in §W.1 (no job scheduler exists yet — see `docs/
  SETUP.md`).

Not built (real follow-up work before production sign-off):

- **No error tracking/APM** (Sentry, Datadog, etc.) — server errors
  currently only reach `console.error`/the hosting platform's own logs.
- **No uptime/health-check endpoint** beyond Next.js's own implicit
  liveness — add a `/api/health` route hitting the DB if a load
  balancer/uptime monitor needs one.
- **No alerting** on the rate limiter tripping repeatedly (a signal worth
  watching — a sustained 429 stream on `/login` is an active
  brute-force attempt).

## Scaling considerations

- **Database connections**: `services/db/client.ts`'s `PgAdapter` uses a
  single `pg.Pool` per process — fine for a single Next.js instance; for
  serverless/multi-instance deployments, route through Supabase's
  connection pooler (PgBouncer, built into every Supabase project) rather
  than opening a fresh pool per cold start.
- **Rate limiter**: in-memory by default (single-instance only); set
  `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (see `docs/
  SECURITY.md`, `docs/SETUP.md`) before running more than one server
  instance — without it, limits become trivially bypassable by hitting a
  different instance.
- **File storage**: local provider is explicitly single-instance-only (it
  writes to that instance's own disk) — any multi-instance deployment
  MUST be configured with the Supabase provider (or a future
  network-backed one), never local.
- **Function region vs. database region** — fixed. Every real request does
  several sequential round trips to Postgres (see `withInstitutionContext`
  in `services/db/client.ts` — `SET LOCAL ROLE`, then the query itself, all
  inside one transaction). If the Vercel function region and the Supabase
  project region are on different continents, each of those round trips
  pays full inter-continent latency, and a page that issues a handful of
  sequential queries can feel sluggish even though every individual query
  is fast. `vercel.json`'s `regions` key pins the function region; set it
  to match (or sit as close as possible to) your Supabase project's
  region — e.g. `["bom1"]` (Mumbai) for a Supabase project on `ap-south-1`.
  Available on Vercel's Hobby plan since regions became selectable there.

## Production readiness checklist

Before treating a deployment as production/live for real institution data:

- [ ] `DATABASE_URL` set to a real, backed-up Postgres instance (not PGlite).
- [ ] `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` set — confirms
      `SupabaseAuthProvider` and `SupabaseStorageProvider` are both active,
      not their local/dev fallbacks.
- [ ] `ALLOW_DEV_AUTH` is unset (or `false`) — `DevAuthProvider` must never
      be reachable in production.
- [x] `services/auth/supabase-auth-provider.ts` uses `@supabase/ssr` (§AA
      follow-up, done) — not independently verified against this specific
      deployment's live Supabase project yet; run the manual checklist in
      `docs/SETUP.md`'s "Real Supabase Auth sessions" section once.
- [ ] SMTP configured (`SMTP_HOST` etc.) if email delivery is required —
      otherwise notifications silently stay console-only/`skipped`.
- [ ] Backup mechanism actually enabled on the chosen Postgres host/tier
      (see "Backup & disaster recovery" above) — not assumed from a
      provider's marketing page.
- [ ] `npm run verify` passing in CI on the commit being deployed.
- [ ] RTO/RPO placeholders in this document filled in with real values for
      the selected hosting tier.
- [ ] At least one restore drill performed and recorded.
- [ ] Rate limiter backed by Upstash Redis (`UPSTASH_REDIS_REST_URL`/
      `UPSTASH_REDIS_REST_TOKEN`) if running more than one server
      instance — the in-memory default is fine for exactly one instance.
