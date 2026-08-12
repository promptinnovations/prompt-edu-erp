# Security

PROMPT EDU ERP's security architecture is documented in full in
`ARCHITECTURE.md` §X (Security Architecture) and §Y (Audit Architecture).
This document summarizes what is actually **implemented** in this codebase
today, points at the exact file/mechanism for each control, and is
explicit about what is a genuine gap rather than letting §X read as a
finished checklist. `DEPLOYMENT.md` covers backups/DR and the
production-readiness checklist; this file covers the application-layer
controls themselves.

## Layered controls (§X.1) — implementation status

| Layer | Status | Where |
|---|---|---|
| Transport (TLS/HSTS) | HSTS header sent (`Strict-Transport-Security`, `next.config.ts`); actual TLS termination is the hosting provider's job — meaningless until deployed behind real TLS | `next.config.ts` `headers()` |
| Authentication | `AuthService` abstraction; `SupabaseAuthProvider` for real deployments, `DevAuthProvider` hard-blocked in production unless `ALLOW_DEV_AUTH=true` is explicitly set | `services/auth/*` |
| Authorization | RBAC + fine-grained permission codes, checked server-side on every server action/route handler via `requirePermission()`/`requireSuperAdminContext()`, never client-trusted | `services/permissions/permission-service.ts`, `services/request-context.ts` |
| Tenant isolation | Dual-gate: application-layer `institutionId` scoping AND PostgreSQL Row-Level-Security on every tenant table | `services/db/client.ts`'s `withInstitutionContext()`, every `database/migrations/*.sql` |
| Input validation | Zod schema validation on every server action/route handler input, independent of any client-side validation | throughout `modules/*/service.ts`, `services/*/*.ts` |
| Secrets | Service-role keys/DB credentials live only in server env vars, never `NEXT_PUBLIC_`-prefixed; enforced by a build-time scanner, not just convention | `scripts/check-no-client-secrets.mjs`, wired into `npm run verify` and CI |
| Rate limiting | Applied at the edge (Next.js middleware) to auth (`/login`) and bulk-write endpoints (import, mark entry, export/template generation) | `middleware.ts`, `services/rate-limit/rate-limiter.ts` — in-memory by default, distributed via Upstash Redis when configured |
| File access | Signed/time-limited URLs for the Supabase provider; local provider streams through an institution-scoped, permission-checked route rather than a public path; server-side size/type validation on every upload regardless of client claims | `services/storage/file-service.ts`, `app/api/files/[fileId]/route.ts` |
| Confidentiality | Mentoring/discipline visibility is application-layer scoped independent of general `view_all` grants (a `view_all` holder still can't read a `restricted`-confidentiality mentoring record they don't own) | `modules/mentoring/service.ts` |
| Audit | Every mutating action writes to `audit_logs` (institution-scoped) or `platform_audit_logs` (Super Admin/cross-tenant) inside the same transaction as the change itself | `services/audit/audit-service.ts`, called from every module service |
| Backups/DR | Documented runbook, not yet exercised against real production infrastructure (none is provisioned yet) | `DEPLOYMENT.md` |

## Never-trust-the-client rules (§X.2) — how each is actually enforced

1. **`institution_id` is never read from client input for authorization.** Every server action/route handler resolves it from `requireRequestContext()`, which derives it server-side from the authenticated session's verified membership rows (`services/tenant/tenant-service.ts`) — never from a request body/query param/header.
2. **Role/permission claims are re-derived server-side per request.** `getPermissionsForUser()`/`resolveUserByAuthId()` query the database fresh on every call; nothing trusts a client-held token's role claim beyond the bare identity claim. `services/super-admin/super-admin-service.ts` goes further and independently re-verifies `isSuperAdmin` inside every one of its own functions, not just at the calling page's layout guard — a deliberate defense-in-depth pair (see that file's header comment).
3. **File uploads are validated server-side (type, size).** `FileService.uploadFile()` enforces `MAX_UPLOAD_BYTES` (default 10 MB, env-overridable) and an explicit MIME-type allowlist, rejecting anything else — including a missing/empty type — regardless of what the browser's `File.type` claims. See `tests/integration/storage-flow.test.ts`'s "upload validation" suite.
4. **Bulk import never inserts unvalidated rows.** `modules/bulk/service.ts`'s `confirmImport()` re-validates every row server-side inside one transaction; a client cannot claim "this file is already validated" to skip that step.

## Secret-leak prevention

`npm run check:secrets` (`scripts/check-no-client-secrets.mjs`) scans every
`"use client"` file for `process.env.<NAME>` references where `NAME` does
not start with `NEXT_PUBLIC_` — the one Next.js-recognized prefix for
values safe to ship to the browser. Wired into `npm run verify` and
`.github/workflows/ci.yml`, so a PR that accidentally references a secret
from client code fails CI rather than relying on review to catch it.

## Rate limiting — current implementation

`middleware.ts` applies a fixed-window limiter (`services/rate-limit/
rate-limiter.ts`) to POST requests against `/login`, `/import`,
`/examinations/*/marks/*`, and `/api/import-template|export/*`. Two
backends implement the same `checkRateLimit()`, chosen automatically:

- **In-memory (default)** — a plain per-process counter. Fine for local
  dev and a single-instance deployment, but resets on restart and does
  NOT share state across multiple server instances behind a load
  balancer.
- **Upstash Redis (when `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN` are set)** — the same fixed-window logic via
  Redis `INCR`/`PEXPIRE`/`PTTL`, so every instance shares one real limit.
  Upstash specifically (REST-based, not a raw TCP Redis client) is what
  makes this usable from `middleware.ts`, which runs on Next.js's Edge
  runtime. Verified with 6 tests (`tests/integration/rate-limit-flow.test.ts`)
  that mock `@upstash/redis`'s client with a small in-memory fake honoring
  the same `incr`/`pexpire`/`pttl` contract — this exercises the REAL
  distributed-backend code path (the increment/expire/TTL logic,
  the over-limit decision, `retryAfterSeconds`) without needing a live
  Upstash project or network access. Not independently verified against a
  real Upstash database in this environment — see `docs/SETUP.md` for a
  one-time manual check.

## Known gaps (do not treat §X as "fully implemented" without reading this)

- ~~No Content-Security-Policy header~~ — **fixed.** `middleware.ts`
  generates a fresh, unpredictable nonce per request and sends a strict,
  nonce-based CSP (`script-src 'self' 'nonce-...' 'strict-dynamic'`;
  `style-src` likewise nonced in production, `'unsafe-inline'` only in
  dev for Fast Refresh) alongside the existing rate-limiting logic — the
  two share one middleware file since Next.js only runs one per request.
  Verified against a real production build (`next build && next start`):
  every inline `<script>`/`<link rel="stylesheet">` Next.js's own runtime
  emits carries the matching nonce (checked via `curl` + grep against the
  served HTML, not just reading the header), the redirect-to-`/login` and
  rate-limit-429 responses both still carry a correct CSP, and the full
  224-test suite plus a clean production build both pass with it in
  place. This app has no third-party scripts, no `next/script` usage, no
  `dangerouslySetInnerHTML`, and no inline `style={{...}}` props anywhere
  (checked before writing the CSP), so nothing needed manual
  nonce-threading beyond `middleware.ts` itself. `X-Frame-Options` is kept
  alongside the CSP's `frame-ancestors 'none'` as a legacy-browser
  fallback, same as before.
- **No MFA.** §X.1 names "MFA support path for staff/admin roles" — not
  built. The `@supabase/ssr` swap (below) makes real sign-in itself work;
  MFA on top of it is still a separate, un-built follow-up.
- ~~`SupabaseAuthProvider` is a minimal placeholder~~ — **fixed.** It now
  uses `@supabase/ssr`'s `createServerClient` (the framework-recommended
  Next.js App Router integration) for `getSession()` (via `getUser()`,
  which revalidates against the Supabase Auth server rather than trusting
  a locally-decoded cookie), `signIn()`, `signUp()`, and `signOut()`.
  `services/tenant/tenant-service.ts`'s new `linkOrResolveAuthenticatedUser()`
  is the one place a verified Supabase identity gets connected to (or
  refused from) this app's own `users` table — see that function's own doc
  comment for the full three-outcome design (already-linked / first-time
  "claim" by verified email / refused because no pre-provisioned account
  exists). Signing up with Supabase Auth alone never grants access to a
  previously-unknown email; an institution admin/Super Admin must create
  the `users` row first through the existing staff/student/parent/
  institution-provisioning flows.
  **Not independently verified against a live Supabase project in this
  environment** — this sandbox's network allowlist blocks `*.supabase.co`
  (confirmed: DNS resolution and the HTTPS proxy both refuse it), so the
  actual token-issuing round trip couldn't be exercised end-to-end here.
  What WAS verified: a clean `tsc --noEmit` against `@supabase/ssr`'s real
  installed types, a clean production build, and 6 new passing tests
  covering `linkOrResolveAuthenticatedUser()`'s DB-side logic (claim,
  case-insensitive email match, already-claimed-by-someone-else refusal,
  no-matching-account refusal) against real Postgres via PGlite — see
  `tests/integration/auth-linking-flow.test.ts`. **A manual pass against
  the real project is a recommended next step**: visit `/login`, use
  "Create account" with a pre-provisioned admin's email (or a fresh one, to
  confirm the expected refusal), confirm via email if the Supabase
  project has email confirmation enabled, then sign in and confirm landing
  on `/dashboard`.
- ~~`LimitService` (§W.2) does not exist~~ — **fixed.** `services/limits/
  limit-service.ts` checks live usage against `subscription_plans.max_*`
  (students/staff/users/storage), with `ok`/`warning` (80%)/`critical`
  (95%)/`exceeded` statuses. `assertBelowLimit()` is wired into
  `createStudent()`, `createStaffMember()`, and `uploadFile()` — it refuses
  only the specific insert/upload that would exceed a hard cap, never
  retroactively touching data already over a lowered cap. Every institution
  is auto-assigned a plan at creation time (`seedDemoInstitution()` and
  `createInstitution()` both default to the oldest active plan). This is an
  application-layer check, not a DB-level constraint — see that file's own
  doc comment for the documented (non-blocking) race-condition caveat. See
  `tests/integration/limit-service-flow.test.ts`.
- ~~Institution `status` not enforced~~ — **fixed.** `services/
  request-context.ts`'s `resolveInstitutionBlockedReason()` blocks any
  non-`active`/`trial` institution for ordinary users (Super Admins are
  exempt, since they're the ones who need access to reactivate it) — every
  server action's existing `if (!ctx.institutionId)` guard now closes
  automatically for a suspended institution, with no per-action changes
  needed. `/suspended` shows a clear reason instead of a bare
  redirect-to-login. See `tests/integration/institution-status-flow.test.ts`.
- ~~Rate limiter is single-instance~~ — **fixed, opt-in.** Distributed via
  Upstash Redis when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
  are set (see above); falls back to the original in-memory limiter when
  they're not, so nothing changes for local dev or a single-instance
  deployment that hasn't configured Upstash yet.
- ~~No automated dependency vulnerability scanning wired into CI~~ —
  **fixed, advisory-only.** `npm run check:audit` (`npm audit --omit=dev
  --audit-level=high`) runs on every push/PR (`.github/workflows/ci.yml`)
  so findings are always visible in the Actions log, but the step is
  `continue-on-error: true` rather than a hard gate — as of this writing
  every available fix for the current findings (`postcss`/`sharp` via
  `next`, `next-intl`, `exceljs`'s `uuid` dependency) requires `npm audit
  fix --force`, i.e. a breaking major-version bump (Next.js 15→16 is the
  significant one) that needs its own deliberate upgrade-and-reverify pass
  across all 18 phases, not something CI should force or silently block
  every commit on. A separate `vitest`-chain critical finding is dev-only
  (`vitest`'s UI-server dependency, not shipped to production) and is
  excluded from the gate via `--omit=dev`. Revisit this as a scoped,
  standalone upgrade task — see `docs/SETUP.md`.
- ~~`app_user` role created but never grantable — real requests couldn't
  set it~~ — **fixed.** `0002_app_runtime_role.sql` created the
  restricted `app_user` role RLS actually applies to (§E.1) and granted
  IT table/sequence privileges, but never granted the CONNECTING
  migration/owner role membership IN `app_user` — `SET LOCAL ROLE
  app_user` (every `withInstitutionContext` call) only succeeds for a
  superuser or an explicit member of the target role. Invisible through
  every prior verification path: PGlite's connecting role is
  effectively a superuser (no membership grant needed at all), and
  `npm run db:migrate`/`db:seed` never call `withInstitutionContext` in
  the first place (migrations intentionally bypass RLS by design). First
  surfaced as `permission denied to set role "app_user"` on the actual
  first real sign-in against Supabase, whose `postgres` role is not a
  true superuser. Fixed by `0019_grant_app_user_membership.sql`: `grant
  app_user to current_user` — portable rather than hardcoding
  `postgres`, so it self-adapts to whatever role runs migrations on any
  host. Anyone who already ran `db:migrate` before this fix just needs
  to run it again — the ledger-based runner applies only the new file.
- ~~No Super Admin control over which modules an institution can use~~ —
  **fixed, partially.** `modules`/`institution_modules` (migration 0001)
  existed in the schema from day one but nothing ever read or wrote them.
  `services/modules/module-service.ts` now does: a Super Admin can enable/
  disable any non-core module (examinations, attendance, library, skills,
  achievements, staff, discipline, mentoring — `academic`/`students` are
  `is_core` and can never be disabled) per institution from `/super-admin/
  institutions/[id]`; a disabled module disappears from that institution's
  own nav (`(institution)/layout.tsx`) and every optional-module page
  redirects to `/module-unavailable` if reached directly
  (`requireModuleEnabledOrRedirect()`, called at the top of each of those
  8 pages). See `tests/integration/module-flow.test.ts`.
  **What this does NOT yet do**: the underlying server actions in those 8
  modules (e.g. `markAttendanceAction`, `addBookAction`) are not
  independently re-checked against the disabled-module state — today they
  only trust the page-level/nav-level gate, unlike the defense-in-depth
  pattern §Z's portal routing uses (checked at both the layout AND every
  individual redirect target). A determined institution admin who already
  has a stale tab open, or who crafts a direct POST, could still write to
  a module UI-disabled for their institution. Low severity (this is an
  institution's own admin acting within their own tenant, not a
  cross-tenant leak — RLS still fully applies), but worth closing with a
  `requireModuleEnabled()` call added to each mutating action before
  treating module gating as airtight.

## Reporting a vulnerability

This is currently an internal build for Prompt Innovations / Badrudhuja
Islamic Centre, not a public-facing open-source project with an external
disclosure program. Report any concern directly to the project owner
rather than filing a public issue.
