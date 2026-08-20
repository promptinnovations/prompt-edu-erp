# Setup

See also `docs/SECURITY.md` (application-layer security controls) and
`docs/DEPLOYMENT.md` (production deployment, backup/DR runbook,
go-live checklist) — both added in Phase 18.

## Local development (no external accounts)

```bash
npm install
npm run db:migrate
SEED_DEMO_INSTITUTION=true npm run db:seed
npm run dev
```

Sign in at `/login` with `admin@badrudhuja.example` (dev-mode, no password).

Data is stored in `database/.pglite-data/` (gitignored) — an embedded
Postgres, not a mock. Delete that folder to reset the local database.

### Trying the Super Admin console (Phase 17)

```bash
SEED_DEMO_INSTITUTION=true SEED_SUPER_ADMIN=true npm run db:seed
```

Sign in at `/login` with `root@prompt-innovations.example` — this account
holds the platform-level `super_admin` role (§B.4) and no institution
membership of its own, so it lands directly on `/super-admin` rather than
the regular institution app. An ordinary institution user who ALSO happens
to be a Super Admin instead sees a "Super Admin Console" link in their
regular sidebar (`app/(institution)/layout.tsx`).

## Connecting a real Supabase project

1. Create a project at https://supabase.com. Your Google account
   (`promptinnovations011@gmail.com`) can be used to sign up.
2. From the project's Settings → API page, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (server-only —
     never prefix this with `NEXT_PUBLIC_`, never expose it to the client,
     per ARCHITECTURE.md §X.1)
3. From Settings → Database, copy the connection string → `DATABASE_URL`.
4. Copy `.env.example` to `.env.local` and fill in the four values above.
5. Run `npm run db:migrate` then
   `SEED_DEMO_INSTITUTION=true SEED_CLAIMABLE=true npm run db:seed` — same
   commands as local dev, now pointed at real Postgres, with one important
   difference: **`SEED_CLAIMABLE=true`**. Without it, the seeded demo
   admin gets the same random-UUID `auth_user_id` stand-in local dev uses
   (so `DevAuthProvider`'s no-password login works) — which would then
   make that email PERMANENTLY unclaimable by a real Supabase Auth sign-up
   (you'd hit "already linked to a different sign-in" on your first real
   login attempt). `SEED_CLAIMABLE=true` leaves `auth_user_id` NULL
   instead, so your first real "Create account" at `/login` with that same
   email claims it correctly — see `database/scripts/seed.ts`'s
   `seedDemoUser()`/`seedSuperAdminUser()` doc comments and
   `tests/integration/foundation-flow.test.ts` for the exact mechanics.
   Only matters on the very first seed run against a fresh database — see
   those same doc comments for why re-running seed later never un-claims
   an already-linked account, whether or not you still have this flag set.
6. `services/auth/auth-service.ts` automatically switches to
   `SupabaseAuthProvider` once `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are both set — no code change needed.

### Real Supabase Auth sessions (§AA follow-up — done)

`services/auth/supabase-auth-provider.ts` now uses `@supabase/ssr`'s
`createServerClient`, replacing the earlier Phase 0 placeholder's manual
cookie/JWT handling. `/login` has both a "Sign in" and a "Create account"
button; `AuthService.signIn()`/`signUp()` authenticate against Supabase
(proving "this person controls this email") but never by themselves decide
whether that email may use this app — `services/tenant/tenant-service.ts`'s
`linkOrResolveAuthenticatedUser()` is the one place that decision is made:

1. Already linked (every login after the first) — resolves immediately.
2. A `users` row exists for the verified email with `auth_user_id` still
   null — a one-time "claim": link it, then resolve. This is what makes
   the normal flow work: an institution admin/Super Admin pre-creates the
   account (`createStaffMember()`, `provisionStudentPortalAccount()`,
   `provisionParentPortalAccount()`, `createInstitution()`'s own admin
   grant), the real person then signs up/in with that SAME email, and gets
   linked automatically on that first real sign-in.
3. Neither matches — refused. Signing up with Supabase Auth alone never
   grants access to a previously-unknown email.

**Not independently verified against your live project in this
environment** — the sandbox this was built in has no network path to
`*.supabase.co` (DNS resolution and the outbound proxy both refuse it), so
the actual Supabase round trip couldn't be exercised end-to-end here. What
WAS verified: a clean typecheck against `@supabase/ssr`'s real types, a
clean production build, and `tests/integration/auth-linking-flow.test.ts`'s
6 tests covering `linkOrResolveAuthenticatedUser()`'s own logic against
real Postgres (via PGlite). **Please do one manual pass** before relying on
this for real users:

1. `npm run dev` (or your deployed URL) with `.env.local`'s real Supabase
   values in place.
2. Pre-create an account for yourself the normal way if you haven't already
   — either `SEED_CLAIMABLE=true npm run db:seed` (see "Connecting a real
   Supabase project" above, first-time bootstrap of a fresh real
   database), or, for an institution/account created after that, the
   normal in-app provisioning flows (`createStaffMember()`, portal
   provisioning, a Super Admin creating a new institution's first admin) —
   note the exact email.
3. Visit `/login`, click "Create account" with that same email and a
   password of your choosing.
4. If your Supabase project has email confirmation ON (the default for a
   new project), check your inbox and click the confirmation link before
   step 5.
5. Sign in with that email/password and confirm you land on `/dashboard`
   (or `/super-admin`/the portal, depending on your role).
6. Try "Create account" again with an email that has NO pre-provisioned
   `users` row — confirm you get the expected refusal message rather than
   silent access.

If step 4's confirmation-email flow feels like too much friction for your
users, Supabase's project settings (Authentication → Providers → Email) let
you turn confirmation off — a product decision for you to make, not
something this codebase should assume either way.

### File storage (Phase 16)

Same two Supabase env vars that switch `AuthService` also switch
`services/storage/storage-provider.ts` from `LocalFileProvider` (writes
under `.local-storage/`, gitignored) to `SupabaseStorageProvider` — no
separate configuration step. `SupabaseStorageProvider` auto-creates its
bucket (`institution-files`, private) on first upload, so no manual
dashboard step is needed there either. Visit `/storage` (requires the
`files.manage` permission — granted to the `management` role by default)
to see the active provider, browse recent files, and trigger a migration of
every existing file to a chosen provider.

### Adding Google Drive later

The original architecture draft (ARCHITECTURE.md §T) named Google Drive as
a third possible storage provider. It is **not implemented** in this build
— no `googleapis` dependency, no `google-drive-provider.ts` — by explicit
decision, to avoid that package's size/build-time cost until it's actually
needed. Adding it later is additive, not a redesign:

1. `npm install googleapis` and write `services/storage/google-drive-provider.ts`
   implementing the same `StorageProvider` interface (`upload`/`download`/
   `getDownloadUrl`/`remove`) as `local-file-provider.ts`/
   `supabase-storage-provider.ts`.
2. Add a migration that runs
   `alter table files drop constraint files_storage_provider_check, add constraint files_storage_provider_check check (storage_provider in ('local', 'supabase', 'google_drive'));`
3. Add one more branch to `getStorageProvider()`/`getStorageProviderByName()`
   in `services/storage/storage-provider.ts` (mirroring the existing
   Supabase branch) and document the new env vars in `.env.example`.

No change is needed to `FileService`, `migration-job.ts`, or any calling
module (achievements, the `/storage` UI, the `/api/files/[fileId]` route) —
that is the entire point of the `StorageProvider` abstraction.

## Known follow-ups (tracked, not blocking Phase 0 sign-off)

- ~~**ESLint flat-config**~~ — **fixed in Phase 18.** `eslint.config.mjs`
  now uses `@eslint/eslintrc`'s `FlatCompat` to bridge
  `eslint-config-next`'s legacy `{ extends: [...] }` preset shape into flat
  config (the actual root cause of the old `nextVitals is not iterable`
  error — spreading that object directly as if it were already a flat-
  config array). Lint runs on every build again (`next.config.ts` no
  longer sets `ignoreDuringBuilds`) and is wired into `npm run verify`/CI.
- ~~**Browser/e2e testing**~~ — **added.** `tests/integration/*.test.ts`
  (296 tests, run against real Postgres via PGlite) prove the data layer,
  tenant isolation, and service layer exhaustively, but exercise no real
  browser or React form. `tests/e2e/*.spec.ts` (Playwright, `npm run
  test:e2e`) closes that gap: `global-setup.ts` wipes and re-migrates+seeds
  a disposable, file-backed PGlite database
  (`database/.e2e-pglite-data/`, gitignored) with the demo institution
  admin and Super Admin accounts, `playwright.config.ts`'s `webServer`
  boots a real `next dev` against it with Supabase env vars explicitly
  blanked out (forcing `DevAuthProvider`, exactly like a fresh clone with
  no Supabase project configured yet), and the specs drive real HTML forms
  through a real browser: `auth.spec.ts` (sign-in error/success, an
  unauthenticated `/dashboard` redirect, sign-out), `academic-and-
  students.spec.ts` (the §AC exit-criterion flow itself — create class →
  section → subject → add student → view student detail — through
  `/academic` and `/students`' actual forms), and `i18n.spec.ts` (the
  locale switcher). `global-teardown.ts` removes the disposable database
  afterward so repeated runs are idempotent.
  **Not executed in this sandbox**: Playwright's browser binary download
  (`npx playwright install`) goes to `cdn.playwright.dev`, which this
  sandbox's network allowlist blocks (`403 Connection blocked by network
  allowlist`) — the same category of restriction documented for Supabase
  above, not something bypassed. What WAS verified here: `npx playwright
  test` ran `global-setup.ts` for real (migrations + seed completed,
  demo/Super Admin accounts created against the disposable e2e database),
  `next dev` booted successfully against it, and all 7 specs were
  discovered and reached the "launch browser" step before failing there —
  and, separately, a manually started `next dev` against the same setup
  was hit directly with `curl`: `/login` renders the expected `email`/
  `password` fields and "Sign in"/"Create account" buttons, and an
  unauthenticated `GET /dashboard` returns a 307 to `/login`, matching
  what the specs assert. The actual in-browser interactions (filling
  forms, clicking, following client-side navigation) are code-complete but
  unexercised. **To verify for real**: run `npx playwright install
  --with-deps chromium` once, then `npm run test:e2e`, anywhere with normal
  internet access (a real dev machine or GitHub Actions both work — this
  sandbox's allowlist is the only thing blocking it). `.github/
  workflows/ci.yml` runs this as its own `e2e` job with `continue-on-error:
  true` until that first real run confirms it passes — flip that off once
  it has.
- ~~**Rate limiter is single-instance only**~~ — **fixed, opt-in.**
  `services/rate-limit/rate-limiter.ts` now has two backends behind the
  same `checkRateLimit()`: the original in-memory counter (default, no
  setup needed), and Upstash Redis (`INCR`/`PEXPIRE`/`PTTL`) when
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set — Upstash
  specifically because it's REST-based, which is what makes it usable
  from `middleware.ts`'s Edge runtime (a normal TCP Redis client isn't).
  Set these up whenever you actually run more than one server instance
  in production; a single instance is fine on the in-memory default.
  **To set up:** create a free database at
  [upstash.com](https://upstash.com) (or via the Vercel Marketplace's
  Storage tab if deploying there), copy its REST URL and token from the
  database's "REST API" section, and add both as
  `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` — in `.env.local`
  for local testing, and in your production host's environment variables
  for real deployments. No code or migration needed beyond that; the
  switch is automatic, same as every other provider swap in this
  codebase (`DATABASE_URL`, the Supabase Auth vars, `SMTP_HOST`).
  **Verified**: 6 tests (`tests/integration/rate-limit-flow.test.ts`)
  mock `@upstash/redis` with a small in-memory fake implementing
  `incr`/`pexpire`/`pttl`, which exercises the real distributed-backend
  logic in `rate-limiter.ts` (not a reimplementation of it) without
  needing a live Upstash project. **Not independently verified against a
  real Upstash database** in this environment (this sandbox has no
  outbound access to `*.upstash.io` — same category of restriction as
  Supabase, not something bypassed). A real Upstash database and its
  credentials were provided for this project
  (`content-mosquito-121857.upstash.io`); the recommended one-time manual
  check once you have normal network access is: set the two env vars,
  run `npm run dev`, submit the `/login` form 11 times quickly (the
  configured limit is 10/minute) and confirm the 11th returns "Too many
  requests," then check the Upstash console's data browser for a
  `ratelimit:login:...` key with a live TTL — confirming requests are
  actually reaching Redis rather than silently falling back to the
  in-memory path.
- **Overdue status computed dynamically, not stored**: `book_issues.status`
  never transitions to a stored "overdue" value (present in the master
  spec's enum) — `is_overdue` is computed on read (`due_date < current_date
  and status='issued'`) since no scheduled-job runner exists yet. Same
  tracked limitation as the analytics/consolidated-score refresh jobs;
  revisit together.
- ~~**Book catalogue create form is minimal**~~ — **fixed.** `/library`'s
  "Add book" form now collects title, subtitle, ISBN, language, copy
  count, and author/publisher/category/shelf — each as a dropdown of
  existing values plus an "add new" text field (a filled "new" field wins
  over a stray dropdown selection, and creates that config row via the
  same `createAuthor()`/`createPublisher()` pattern; `createBookCategory()`
  and `createShelf()` are new, mirroring those two). `books.shelf_id`
  existed in the schema since migration 0011 but `createBook()` never
  accepted it — fixed alongside the UI wiring. See
  `tests/integration/library-flow.test.ts`'s new "full 'Add book' fields"
  suite.
- **No event bus yet**: §L.3 describes portfolio writes as reacting to a
  "`<module>.approved`" event via a subscriber; this build calls
  `recordPortfolioEvent()` directly from each approval workflow
  (`modules/skills/service.ts`, `modules/achievements/service.ts`) instead
  of through a real pub/sub layer, matching how the scoring engine is wired
  in Phase 7. Functionally equivalent today (both approval workflows are
  the only two places source data can become "approved"), but adding a new
  approval-gated module currently means remembering to call
  `recordPortfolioEvent()` explicitly rather than it happening
  automatically — worth revisiting alongside the event bus described in
  §G.3 if the number of portfolio-feeding modules grows much further.
- **Student 360° attendance window is fixed to "current academic year to
  date"**: `getStudent360()` doesn't accept a caller-supplied date range
  (§L.4 doesn't specify one) — revisit if a "compare this term to last
  term" view is wanted later.
- **No dedicated `activity_code` column on `skill_activities`**: the scoring
  engine's `activity_code` match (§K.2) is derived by slugifying the skill
  activity's `name` (see `modules/skills/service.ts`'s `slugify()`) rather
  than a stable, independently-editable code — renaming an activity changes
  which scoring_rules row matches it. Fine at seed-data scale; add a real
  `code` column (mirroring `exam_types.code`) before institutions are
  renaming activities on their own.
- **Consolidated score components limited to what's built**:
  `getNormalizedScore()` only implements academic/attendance/skills/
  achievements: unknown component_module values (e.g. "character",
  "activities" from the master spec's example weighting) return 0 rather
  than throwing, so a misconfigured performance_components row silently
  contributes nothing instead of erroring loudly. Revisit once discipline/
  mentoring (Phase 11) and clubs/events exist, and consider making an
  unknown module a hard error instead once every intended module is built
  (an unrecognized value would then be a real config mistake, not a
  not-yet-implemented one).
- **No scheduled consolidated-score recompute**: like analytics refresh
  (§N.3 above), `computeConsolidatedScore()` is on-demand only via the
  `/scoring` UI, not the "nightly, or on-demand when an approval changes
  underlying data" schedule described in §K.5. Same tracked follow-up as
  the analytics refresh job.
- **`usage_metrics` rollup job doesn't exist yet**: the table, its RLS, and
  `subscription_plans`/`institutions.plan_id` (§W.1, §W.2) have existed
  since migration 0001, but nothing populates `usage_metrics` on a
  schedule. `getPlatformUsageOverview()` (Phase 17,
  `services/super-admin/super-admin-service.ts`) and `LimitService`
  (`services/limits/limit-service.ts`, see below) both compute the same
  shape of numbers live/on-demand instead — same class of follow-up as the
  analytics-refresh and consolidated-score jobs above; wire all of them to
  one real job runner together rather than separately.
- ~~**`LimitService` (§W.2's plan-limit warnings) is not built**~~ —
  **fixed.** `services/limits/limit-service.ts` checks live usage against
  `subscription_plans.max_students/max_staff/max_users/max_storage_mb`,
  with `ok`/`warning` (≥80%)/`critical` (≥95%)/`exceeded` statuses.
  `assertBelowLimit()` is wired into `createStudent()` (`modules/students/
  service.ts`), `createStaffMember()` (`modules/staff/service.ts`), and
  `uploadFile()` (`services/storage/file-service.ts`) — each refuses only
  the ONE insert/upload that would exceed a hard cap; existing data is
  never retroactively touched even if a plan downgrade puts an institution
  over its new cap. Both `seedDemoInstitution()` and Super Admin's
  `createInstitution()` now auto-assign the oldest active plan at creation
  time, so `institutions.plan_id` is never left null. This is an
  application-layer check (not a DB-level constraint/advisory lock) —
  sufficient to stop the common case, not airtight against a genuine race
  between two simultaneous requests at the exact boundary; see that file's
  own doc comment. No UI surfaces the warning/critical percentages yet
  (`getInstitutionLimitsOverview()` returns the right shape for a future
  dashboard widget, e.g. on `/super-admin` or an institution admin's own
  dashboard) — that's the remaining, purely-presentational piece. See
  `tests/integration/limit-service-flow.test.ts`.
- ~~**Institution deactivation has no cascading effect**~~ — **fixed.**
  See `docs/SECURITY.md`'s "Known gaps" for the current state.
- ~~**No Content-Security-Policy header**~~ — **fixed.** `middleware.ts`
  now sends a nonce-based CSP on every request, verified against a real
  production build/start — see `docs/SECURITY.md`'s "Known gaps" for the
  full detail on what was checked before shipping it.
- **Rate limiter is single-instance/in-memory** (Phase 18,
  `services/rate-limit/rate-limiter.ts`): sufficient for a single Next.js
  instance, not a multi-instance production deployment. See
  `docs/DEPLOYMENT.md`'s "Scaling considerations".
- ~~**No dependency vulnerability scanning in CI**~~ — **fixed,
  advisory-only.** `.github/workflows/ci.yml` now runs `npm run
  check:audit` (`npm audit --omit=dev --audit-level=high`) on every push/
  PR, but as `continue-on-error: true` rather than a hard gate — every
  currently-open finding (`postcss`/`sharp` transitively via `next`,
  `next-intl`, `exceljs`'s `uuid`) only has a fix that requires `npm audit
  fix --force`, i.e. Next.js 15→16 (a real breaking major-version upgrade
  needing its own dedicated pass across the whole app, not something to
  force blindly here). **Tracked as a standalone future task: plan and
  execute a Next.js 15→16 upgrade** (and the smaller `next-intl`/`exceljs`
  bumps alongside it), then flip this CI step to a hard gate once clean.
  See `docs/SECURITY.md`'s "Known gaps" for the full finding list.
- ~~**Skill submission evidence upload wiring is partial**~~ — **fixed.**
  `modules/skills/service.ts`'s `createSubmissionSchema`/
  `createSkillSubmission()` now accept and persist `evidenceFileId`
  (`skill_submissions.evidence_file_id` existed since Phase 16 but nothing
  read or wrote it); every RETURNING/SELECT for skill_submissions was
  updated to include it. `/skills`'s `SubmitSkillForm.tsx` now has an
  "Evidence" file field, `actions.ts`'s `submitSkillAction()` uploads it
  first via `uploadFile()` (same upload-then-link pattern as
  `/achievements`'s certificate field) before creating the submission, and
  `SubmissionsTable.tsx` shows a "View" link for any submission with
  evidence attached. See `tests/integration/performance-flow.test.ts`'s new
  evidence round-trip test.
- **No subject-teacher assignment table yet**: per-teacher performance
  attribution (§N.5) and any "my class" scoping for skills/achievements
  review queues both need this; deferred to the staff module (Phase 10).
- **Analytics refresh has no scheduler yet**: `refreshAnalyticsViews()` is a
  manual, on-demand action (a button in `/analytics`) rather than the
  hourly-plus-on-write-event job described in ARCHITECTURE.md §N.3. Fine at
  this phase's scale; wire up a real job runner (or `pg_cron` if available on
  the target Postgres) before institution-facing dashboards are load-bearing.
- **Materialized views have no RLS**: Postgres does not support row-level
  security policies on materialized views, so `mv_exam_subject_stats` and
  `mv_attendance_monthly` (migration 0007) rely entirely on
  `modules/analytics/service.ts` filtering every query by institutionId —
  there is no database-enforced second gate for this one layer, unlike every
  other table in the schema. Do not query these views from anywhere outside
  that service file. See the migration file for the full rationale and the
  tracked upgrade path.
- ~~`@supabase/ssr`~~ — **done**, see "Real Supabase Auth sessions" above.
- **Full subscription plan values**: `subscription_plans` seed currently has
  one placeholder "Starter" plan (ARCHITECTURE.md §AC.3 open question #2).

- **`staff_leave` table is unused by design**: migration 0006 (Phase 4)
  created a dedicated `staff_leave` table per the master spec's literal
  §D.6 schema, but migration 0012 (Phase 10) wires staff leave through the
  already-built, already-tested generic `leave_applications` workflow
  (`applicantType: 'staff'`) instead — one workflow instead of two nearly
  identical ones. `staff_leave` remains in the schema for spec fidelity but
  has no service/UI reading or writing it; a future cleanup migration could
  drop it once confirmed nothing external depends on its existence.
- **`staff_attendance`'s original unique constraint didn't support upsert
  when `period` is null**: `unique (institution_id, staff_id, date,
  period)` treats every NULL `period` as distinct under Postgres's default
  null-handling for unique constraints, so two "mark attendance, no
  period" calls for the same staff/date would have inserted two rows
  instead of updating one. Migration 0012 replaces it with a
  `coalesce(period, '')` expression unique index so `ON CONFLICT` can
  target it correctly — see the migration's comments and the staff-flow
  test that specifically asserts no duplicate row is created.
- **`users` needed a new, narrowly-scoped SELECT policy for Phase 10**:
  every module before the staff directory only ever looked up its OWN
  acting user (already covered by `users_select_self` from migration
  0001) — nothing previously needed to list OTHER users' names. Listing
  staff (`listStaff`/`getStaffMember`, plus the `teacher_assignments` and
  `portion_plans` displays that join to `users` for a teacher's name)
  is the first such case, so migration 0012 adds
  `users_select_institution_colleague`: visible to anyone whose current
  institution context is one the target user also holds an active
  membership in. A naive version of this policy (a plain subquery against
  `user_institution_memberships`) caused "infinite recursion detected in
  policy for relation users", since that table's own SELECT policy
  (migration 0003) queries `users` right back — fixed with a `SECURITY
  DEFINER` helper function (owned by the RLS-exempt migration-owner role)
  that breaks the cycle. Also worth knowing: `INSERT ... RETURNING`
  re-checks SELECT policies on the returned row and errors (not silently
  omits) if it wouldn't otherwise be visible — `createStaffMember()`
  works around this by generating the new user's id client-side and
  skipping `RETURNING` entirely, since at the moment of that insert the
  new user has no membership row yet to make them visible under either
  policy.
- **Creating a staff member for an email that's already a `users` row
  isn't supported yet**: `createStaffMember()` does a plain `INSERT` (no
  `ON CONFLICT DO UPDATE`) because Postgres RLS requires the UPDATE
  policy's checks to pass for that clause even when no conflict actually
  occurs, and `users_write_self` only allows a user to update their own
  row — an institution_admin provisioning a colleague's account isn't
  "themself". A genuine email collision (e.g. someone who's already a
  parent, or already staff at another institution) currently surfaces as
  an error rather than attaching the existing account; supporting that
  properly needs a deliberate "link existing user" flow, not a silent
  `ON CONFLICT`.
- **No per-teacher subject-performance attribution wired up yet**:
  `teacher_assignments` (§D.3) now has a real service/UI
  (`listAssignmentsForTeacher()`), which was the piece the Phase 5
  analytics follow-up was waiting on — but `modules/analytics/service.ts`'s
  `getSubjectPerformanceIndicators()` hasn't been updated to actually join
  against it yet. Straightforward next step, not a redesign.

- **Confidentiality is enforced in application code, not RLS**: `mentoring_
  records.confidentiality_level` is stored, but the actual "assigned mentor
  only" access rule (§75) is enforced in `modules/mentoring/service.ts`
  (an explicit `MentoringScope` param every read function requires),
  because RLS's institution-isolation policies have no concept of "which
  staff member" — only "which institution". This is the same
  application-layer-gate-on-top-of-RLS pattern already used for
  materialized-view analytics (migration 0007) and library reading reviews,
  just applied to a finer within-institution boundary for the first time.
- **No mentor-assignment table**: per the master spec's literal §D.8
  schema, there is no separate "student X is assigned to mentor Y" table —
  a staff member simply becomes a student's mentor by authoring a
  `mentoring_records` row with themselves as `mentor_id`. There's currently
  no way to see "which students am I supposed to be mentoring but haven't
  written a note for yet"; that would need a real assignment table, which
  the spec doesn't define. Worth revisiting if mentor caseload becomes a
  real institutional need.
- **Character rating scale (1-5) is a documented default, not from the
  spec**: §D.8's `character_assessments(rating, ...)` doesn't specify a
  scale. This build picked 1-5 (same "pick a concrete, documented default"
  approach as Phase 10's `employment_status` enum) and normalizes it to
  0-100 for the scoring engine via `rating/5*100`. An institution wanting a
  different scale would need a migration, not just new seed data — flagged
  here in case that assumption needs revisiting before other institutions
  onboard.
- **Discipline doesn't feed the scoring engine or the pattern-recognition
  system yet**: §D.8's discipline_records are recorded and viewable
  (including a Student 360° "active flags" feed), but nothing yet computes
  attendance/discipline trend patterns (§G.3's "Attendance/discipline
  pattern job") — that's part of the not-yet-built reporting/pattern
  system (later phases), not a Phase 11 gap.

- **No self-service account request flow**: portal accounts are always
  provisioned BY an admin (`users.manage`), from the student's detail page
  or the new parent-linking section there — there's no "sign up" or
  "forgot my login" flow for a parent/student to request one themselves.
  Fine for an admin-managed onboarding process; revisit if self-service
  registration becomes a real requirement.
- **Reusing an existing `users` account for a new portal link isn't
  supported**: `provisionStudentPortalAccount()`/`provisionParentPortalAccount()`
  do a plain INSERT (see migration 0014's header and the code comments) and
  throw on an email collision rather than attaching an existing account —
  same limitation, same reasoning, as Phase 10's `createStaffMember()`. A
  person who is legitimately both a parent AND a staff member, for
  instance, currently needs two different login emails.
- **A parent portal always shows the primary child by default**: with
  multiple children, `ChildPicker` lets you switch, but the initial
  landing selection is "the primary-contact child, else the first one
  returned" — there's no persisted "last viewed child" preference.
- **No email/notification when a portal account is provisioned**: the new
  login email is simply displayed as created; nothing sends the
  parent/student their credentials or tells them to visit `/login` and use
  "Create account" with that email. Real delivery needs
  `services/notification/notification-service.ts` (Phase 15, already
  built) wired into `provisionStudentPortalAccount()`/
  `provisionParentPortalAccount()` — not done yet.

- **PDF reports are Latin-only**: pdfkit's built-in standard 14 fonts have
  no Arabic/Malayalam/Urdu/Devanagari/Kannada glyphs, and embedding a real
  multi-script font stack (Noto Sans Arabic/Malayalam/Devanagari/Kannada,
  including RTL shaping for Arabic/Urdu) is real follow-up work that
  hasn't been done — a non-Latin name in a PDF report currently renders
  blank/tofu for that name. The XLSX renderer (exceljs) has no such
  limitation, since Excel handles glyph rendering client-side from plain
  Unicode text (§P.3). Use Excel export for any report where student/staff
  names are likely to be in a non-Latin script until this is fixed.
- **Reports are never persisted**: `reports.file_id` (§D.13) stays null in
  this build — `generateReport()` streams PDF/XLSX bytes straight to the
  HTTP response and only logs metadata (who/when/what/format) to the
  `reports` table. Re-downloading a report re-runs its query rather than
  fetching a stored file. The `files` table and a working, tested
  `reports_file_id_fkey` constraint both exist as of Phase 16 — wiring
  `generateReport()` to call `uploadFile()` and set `file_id` is now a
  straightforward addition, not a schema gap, if a "download exactly what
  was generated then" guarantee is wanted.
- **No custom Report Builder UI yet**: `report_definitions.institution_id`
  (§59) exists in the schema for a future per-institution custom report
  builder, but every seeded row currently has `institution_id = null`
  (global, built-in reports only) — `/reports` only lets you pick among
  the five built-ins and fill in their fixed parameters, not compose a new
  report from arbitrary columns/filters.
- **No scheduled report generation/delivery**: reports are generated
  on-demand only, from the `/reports` UI — the master spec's "scheduled
  report" concept (e.g. a weekly attendance summary emailed automatically)
  needs both a job runner and the communication module, neither of which
  exist yet.

- **Marks and attendance are not bulk-importable yet**: §Q.3's v1 target
  list includes marks and attendance, but both need an extra SELECTION
  parameter beyond "one file, one entity type" — an exam subject for
  marks, a class/section/date for attendance — that doesn't fit the
  generic `EntityImportDefinition` shape every other entity in
  `modules/bulk/service.ts` uses. Both already have dedicated grid-entry
  UIs (`/examinations/[id]/marks/[examSubjectId]`, `/attendance`) covering
  day-to-day manual entry; bulk import for either is a real, scoped-out
  follow-up (a `parseRow()` that also validates each row's implied exam
  subject or date against the file's declared target), not a redesign.
- **discovered mid-phase: create*/submit* functions each opened their own
  transaction, defeating batch atomicity — fixed via an optional
  `scopedClient` param**: `confirmImport()` originally called
  `createStudent()`, `createStaffMember()`, etc. back-to-back in a loop,
  assuming that because `confirmImport()` itself runs inside one
  `withInstitutionContext()` call, everything inside it shared that same
  transaction. It doesn't — every one of those service functions calls
  `getDbClient().withInstitutionContext(...)` again internally, which for
  the real-Postgres adapter opens a genuinely separate pooled connection
  (a totally independent transaction), and even for the PGlite adapter
  (a single shared connection) a nested `begin`/`commit` pair commits the
  whole session's work early rather than nesting. Net effect: without the
  fix, a row that failed to insert would NOT roll back rows that "succeeded"
  earlier in the same batch — silently violating §Q.1's core promise.
  Fixed by adding an optional trailing `scopedClient?: DbClient` parameter
  to the functions the bulk importer calls
  (`createClass`/`createSection`/`createSubject` in
  `modules/academic/service.ts`; `createStudent`/`createParent`/
  `linkParentToStudent`/`enrollStudent` in `modules/students/service.ts`;
  `createStaffMember` in `modules/staff/service.ts`; `createBook` in
  `modules/library/service.ts`; `submitAchievement` in
  `modules/achievements/service.ts`; `createStudentLoginAccount` in
  `modules/portal/service.ts`) — when provided, the function inserts
  against that client instead of opening a new one. Purely additive (every
  existing call site is unaffected), and covered by an integration test
  (`tests/integration/bulk-flow.test.ts`) that specifically deletes a
  referenced class between staging and confirming, forcing a mid-batch
  failure, and asserts the earlier row in the same batch is rolled back too.
- **§137 follow-up: "Enrollments" and "Student logins" bulk import entity
  types** generalize what was first built as a one-off script for a single
  institution (Madrasathul Muhammadiyya, Pappinippara) into a self-service
  feature any institution admin can use, with their own class/section
  naming and their own choice of password: `/import` → "Classes" → 
  "Sections" (both already accepted arbitrary names, e.g. "LKG"/"Std
  1"/"Grade 6" — nothing here is numeric-only) → "Students" → "Enrollments"
  (assigns each student, by admission number, to a class+section for the
  current — or a named — academic year) → "Student logins" (username is
  always the student's full name as already entered, generated
  automatically with a numeric suffix on collision; password is whatever
  the uploaded file's `password` column says — most institutions will use
  the parent's phone number, matching the mmp convention, but this column
  accepts anything 4–30 characters). `database/scripts/import-mmp-students.ts`
  remains as a direct-SQL-access alternative for anyone who prefers a
  script over the UI, but is no longer the only way to do this.
- **Students import now requires the minimum real-world field set** (per
  explicit request: "student data must contain minimum these details: Std,
  Div, Adm No, Student Name, Father, DOB, Gender, Mobile No" — the columns
  on a physical class register): `modules/bulk/service.ts`'s students
  definition now requires Std (class name)/Div (section name)/Adm No/
  Student Name/Father/Mobile No (DOB and Gender stay optional, as before).
  Unlike a cosmetic template change, each of the new columns does real
  work in `insertRow()` rather than sitting unused: Std/Div immediately
  `enrollStudent()`s the new student into that class/section for the
  institution's current academic year (the same function the standalone
  "Enrollments" entity type above calls), and Father/Mobile No
  `createParent()` + `linkParentToStudent()` a linked guardian record
  (relationship="Father", phone=Mobile No — the same functions "Parents /
  guardians" calls). A row fails validation up front if its class/division
  doesn't exist yet, or if the institution has no current academic year
  set — both with the same referential-check messages the "Enrollments"
  entity type already gives. The standalone "Enrollments" and "Parents /
  guardians" entity types are unchanged and still useful for a second
  guardian, a later class transfer, or importing students before classes
  exist.
- **Parent import dedup only applies when an email is given**: since
  `createParent()` has no unique constraint to check against (a real
  institution can have two different parents named the same thing),
  `modules/bulk/service.ts`'s parents import definition only flags a
  duplicate when the row's email matches an earlier row/nothing when it's
  blank — every emailless row is treated as a distinct parent, even if two
  rows happen to share a full name.
- **Library book import has no dedup at all**: a real catalogue can
  legitimately contain more than one row with the same title (e.g. a new
  edition), so the `library_books` import definition never flags a
  duplicate; it also only imports title + copy count (no author/publisher/
  category linking), matching the existing "Add book" form's already-
  documented minimal scope.
- **§137 follow-up: per-institution grading/points configuration UI**
  (`/settings/grading`) — grade scales/bands (examination module), scoring
  rule points (scoring engine), achievement categories/levels, and skill
  types/activities were all institution-scoped in the schema since their
  original phases, but only createable (or not even that — skill types had
  no create function at all) via seed scripts, with no update/delete. Every
  institution now defines and edits its own independently: `modules/
  examination/service.ts` gained `createGradeScale`/`updateGradeScale`/
  `deleteGradeScale`/`setDefaultGradeScale`/`createGradeBand`/
  `updateGradeBand`/`deleteGradeBand`; `modules/scoring/service.ts` gained
  `updateScoringRule`/`deleteScoringRule`; `modules/achievements/service.ts`
  gained `updateAchievementCategory`/`deleteAchievementCategory`/
  `updateAchievementLevel`/`deleteAchievementLevel`; `modules/skills/
  service.ts` gained `createSkillType`/`updateSkillType`/`deleteSkillType`/
  `createSkillActivity`/`updateSkillActivity`/`deleteSkillActivity` (plus
  `listSkillActivitiesForAdmin()`, an inactive-inclusive companion to the
  submission-form-facing `listSkillActivities()`). Deletes are guarded
  against rows already referenced by real history (an examination for a
  grade scale, a `score_events` row for a scoring rule, an `achievements`
  row for a category/level, a `skill_submissions` row for an activity) —
  refuses with a clear message rather than either a raw FK error or (worse)
  a silent cascade through real student data; scoring rules/skill
  activities offer deactivation (`isActive: false`) as the safe alternative
  once something is in use. Covered by
  `tests/integration/institution-config-flow.test.ts`.
- **§137 follow-up: Badrudhuja's `type` was wrong in production** — it was
  seeded as `madrasa`; it's a college. Corrected directly in the DB
  (`update institutions set type = 'college' where lower(code) =
  'badrudhuja'`). No code change was needed, but it's the reason
  `createInstitutionSchema`'s madrasa-only board validation (below) only
  fires for genuinely-madrasa institutions.
- **§137 follow-up: separate installable PWAs per institution, actually
  fixed** — `id`/`scope`/`start_url` differing per institution inside the
  manifest JSON was necessary but not sufficient; `app/layout.tsx`'s
  metadata and `app/manifest.webmanifest/route.ts`'s icon URLs were
  **literal, identical strings** (`/manifest.webmanifest`, `/icon-badge/
  192`) for every institution, and browsers key install/cache behavior off
  the request URL itself, not just the parsed JSON. Fixed by adding
  `assetBasePath` to `services/branding/app-identity.ts`'s `AppIdentity`
  (`/<code>` for an institution, `""` for generic/super-admin) and
  prefixing every manifest/icon URL with it — reusing the already-existing
  `/<code>/<rest>` middleware rewrite, so no new routes were needed.
- **§137 follow-up: institution-scoped login now rejects other
  institutions' accounts** — `/mmp/login` previously accepted any
  institution's valid staff credentials and silently routed the user to
  their real institution's dashboard (RLS still prevented any actual data
  leak, but it broke the "install MMP's app, only MMP logins work there"
  expectation). `app/(auth)/login/actions.ts` now reads the
  `ACTIVE_INSTITUTION_COOKIE`-set institution code and rejects (signing the
  user back out) when a non-super-admin's real institution doesn't match
  it, via `resolveActiveInstitution()`'s existing (previously unused)
  `requestedInstitutionCode` parameter.
- **§137 follow-up: "Classes" sidebar hub** (`/classes`,
  `/classes/[classId]`) — a single overview pulling together data that
  used to live scattered across `/academic` (names only), `/students`,
  `/staff` (`teacher_assignments`), and `/attendance`: every class grouped
  by phase (LP 1–4 / UP 5–7 / HS 8–10 / HSS 11–12, presentational only,
  computed from numeric class names — a class named anything else falls
  into "Other"), its divisions (the existing `sections` table — labelled
  "Division" here per the platform owner's own vocabulary: "A, B, C, D are
  divisions, section is like LP, UP, HS, HSS"), assigned class teacher,
  student count, and a deep link into that division's attendance for
  today. Deliberately a read-only hub with links out to the existing
  create/edit forms rather than a duplicate of each one.
- **§137 follow-up: Educational Board for madrasa institutions (SKSVB /
  SKIMVB)** — Super Admin's institution-creation form now shows an
  "Educational board" selector whenever type = madrasa (required; rejected
  for any other type). `institutions.board` (migration
  `0024_institution_board.sql`) records the choice. Selecting **SKSVB**
  auto-provisions, inside the same creation transaction
  (`provisionSksvbDefaults()` in `services/super-admin/
  super-admin-service.ts`): classes 1–12, every subject from the given
  SKSVB syllabus, and `class_subjects` linking each class to its own
  subject list. "Qur'an & Hifz" (present from class 2 onward) is flagged
  `subjects.category = 'practical'` and `class_subjects.is_core = false` —
  it's graded out of 20 marks with **no** TE/CE split, unlike every other
  subject, which uses TE(80) + CE(20) = 100 (per the platform owner:
  "practical only 20, other subjects 80+20"). **Scoped out of this pass**:
  actually computing a combined TE+CE result per subject. `exam_types`/
  `examinations`/`exam_subjects` are per-academic-year instances an
  Institution Admin creates later (an institution has no academic year yet
  at Super Admin creation time), and the existing results engine
  (`computeResults()` in `modules/examination/service.ts`) computes one
  examination at a time — it has no notion of "combine these two
  examinations' marks into one subject total" yet. When an Institution
  Admin sets up TE and CE examinations for a board = 'sksvb' institution,
  they should give Qur'an & Hifz a single 20-mark component (in either
  exam, not both) and every other subject 80 marks under TE + 20 under CE;
  a real combined-result feature is a follow-up, not built here.
  **SKIMVB** is accepted by the form and recorded, but has no
  auto-provisioning yet — the platform owner said its syllabus/rules would
  follow later.
- **§137 follow-up: staff login provisioning ("mail id can be their user id
  and phone number as passwords... should be editable anytime")** —
  `createStaffMember()` (the existing `/staff` "Add staff member" form)
  only ever created a claimable placeholder (`auth_user_id = null`),
  requiring the person to self-serve sign up. `modules/staff/service.ts`
  gained `createStaffLoginAccount()`/`resetStaffLoginPassword()`, mirroring
  `modules/portal/service.ts`'s `createStudentLoginAccount()`/
  `resetStudentLoginPassword()` exactly: a real Supabase Auth account using
  the staff member's own on-file email and a server-set password (by this
  feature's convention, their phone number) — the same narrow,
  already-documented exception to "nobody's password ever passes through
  this app's server" those two functions and `createInstitution()`'s admin
  bundle all share. New `/staff` Directory column ("Create login" /
  "Reset password", editable any time, not just at creation) wired via
  `StaffLoginCell.tsx` and two new server actions.
  Building this surfaced a real, previously-untested bug shared by BOTH
  the new staff code and the existing student-login reset path: `users_
  write_self` (migration 0001) only allows a user to update their own row,
  so an admin's plain `update users set auth_user_id = ...` (or `phone =
  ...`) on a COLLEAGUE's row silently affects 0 rows under RLS — no error,
  just a no-op. `resetStudentLoginPassword()`'s own test only ever asserted
  the call didn't throw, never that the phone value actually changed, so
  this had been latent since that feature shipped. Fixed by migration
  `0025_admin_login_provisioning.sql`'s `set_login_credentials()` — a
  narrowly-scoped `SECURITY DEFINER` function (same pattern
  `0012_staff.sql`'s `user_shares_current_institution()` already
  established) that re-derives its own authorization (target user must
  hold an active membership in the CALLER's current institution context)
  rather than trusting the caller's institutionId argument, and both the
  new staff functions and the existing `resetStudentLoginPassword()` now
  call it instead of a raw UPDATE. `tests/integration/staff-flow.test.ts`
  and `student-admin-flow.test.ts` both assert the actual persisted value,
  not just that the call resolved.
- **§137 follow-up: institution identity was stale on the FIRST request
  through a new institution's URL, not just the very first request ever**
  — found by literally testing "can I install separate apps now" live in
  a browser: visiting `/badrudhuja/login` right after `/mmp/login` (same
  browser, same session) kept rendering MMP's title/manifest/icons on
  that very first `/badrudhuja/...` request. Root cause:
  `middleware.ts`'s institution-URL routing only ever wrote the resolved
  code onto the RESPONSE cookie (`response.cookies.set(ACTIVE_
  INSTITUTION_COOKIE, ...)`), which only changes what the browser sends
  on its NEXT request — `services/request-context.ts`'s
  `getRequestContext()` reads the active institution via `next/headers`'
  `cookies()`, which reflects the INCOMING request, never a mutation the
  same middleware invocation made to the outgoing response. So every
  single navigation to a DIFFERENT institution's URL in an existing
  browser session rendered the PREVIOUS institution's identity for one
  full request (title, manifest, icons — not page content, which is
  correctly resolved via the URL rewrite itself and unaffected). Fixed by
  also rewriting the `cookie` REQUEST header directly (not just the
  response) in `middleware.ts`, so the very same request's server-side
  render sees the correct institution immediately — verified live via
  Claude in Chrome: fresh tab → `/mmp/login` → manifest correctly "MMP" →
  same tab → `/badrudhuja/login` → manifest correctly "badrudhuja" on
  the first load, no second visit needed.
- **CSV import uses a hand-rolled RFC4180-ish parser, not a library**:
  `modules/bulk/service.ts`'s `parseCsv()` handles quoted fields, escaped
  quotes, and CRLF/LF line endings, but hasn't been fuzz-tested against
  arbitrary malformed CSV the way a maintained library (e.g. PapaParse)
  would be. XLSX upload (via the already-installed `exceljs`) is the more
  robustly-tested path; CSV is offered because §Q.1 explicitly lists it as
  a supported fill-in format.

- **No real email delivery configured in this environment**:
  `services/notification/smtp-email-provider.ts` is real, standard
  nodemailer SMTP transport code, selected automatically once `SMTP_HOST`
  (+`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_SECURE`/`MAIL_FROM`) is set —
  but no SMTP credentials are configured here, so every notification's
  `email` row is honestly recorded as `status='skipped'` via
  `ConsoleEmailProvider` (which logs what WOULD have been sent). Same
  situation as `services/auth/supabase-auth-provider.ts` before real
  Supabase credentials were connected: the code exists and follows the
  established provider-swap pattern, but is untested against a real
  mailbox in this build's environment.
- **SMS / push notification channels have no provider at all**: the
  `channel` check constraint on `notifications` (migration 0017) already
  allows `sms`/`whatsapp`/`push` (§R.4 "push is a progressive
  enhancement"), and `notifyUser()` will happily accept a request for any
  of them, but `sms`/`push` requests are always recorded as
  `status='skipped'` — there is no Twilio SMS/web-push integration in this
  build. `whatsapp` DOES have a real provider now (GREEN-API, see the
  attendance-alerts entry below) — wiring a real SMS/push provider in means
  adding a new file mirroring `email-provider.ts`'s shape, not a redesign.
- **Announcement audience targeting is "everyone" or "by role" only**:
  the master spec's `audience_jsonb` column can in principle hold any
  targeting shape, but this build's `AnnouncementAudience` type only
  supports `{type:"all"}` and `{type:"role", roleCodes:[...]}` —
  "specific class" or "specific individual" targeting was deliberately
  scoped out, since resolving "which parents/students should this reach"
  for a class depends on those students/parents having portal accounts
  (§Z), and Phase 12's own follow-ups already note there's no
  self-service account request flow yet, so a "class" audience would
  often silently reach nobody. Revisit once portal account coverage is
  more universal.
- **No notification preferences / per-channel opt-out yet**: every
  `notifyUser()` call defaults to `["in_app", "email"]` — there is no
  `notification_preferences` table or per-user "don't email me" toggle.
  The master spec doesn't define one explicitly either; worth adding if
  email volume becomes a real concern once SMTP is actually connected.
- **NotificationService is wired into exactly one existing workflow this
  phase**: `reviewLeaveApplication()` (`modules/attendance/service.ts`)
  calls `notifyUser()` to prove the core service genuinely generalizes
  beyond announcements, not just in theory — but marks/attendance/skills/
  achievements approvals don't yet notify anyone. Adding a call is
  mechanical (see that function's diff) once it's clear which approval
  events institutions actually want notified; wiring every workflow
  pre-emptively risked over-notifying without real usage feedback.

## Attendance alerts + leave workflow (§D.6 follow-up)

Built in response to: "attendance must present by default... if someone
marked for late coming that also should go as a message... once attendance
is saved, a preview of absentee and latecoming alert will be shown, should
be editable, cancellable, then press confirm whatsapp message will be
sent... each class should show applied leaves for that day at the bottom...
for parents log in they need to have an option for apply for leave — class
teacher can sanction it... daily attendance + absentee list must be visible
to principal."

- **Two real, previously-undiscovered production bugs found and fixed
  while building this**, both in `createInstitution()`
  (`services/super-admin/super-admin-service.ts`) — the real,
  production institution-creation path, as opposed to
  `database/scripts/seed.ts`'s demo-only `seedInstitutionDefaults()`:
  1. It never seeded `attendance_statuses` — every institution created
     through it (KEMHS, MMP; Badrudhuja had been backfilled by hand
     earlier) had a completely EMPTY "Take attendance" status dropdown
     (zero `<option>`s) until an admin manually added statuses through the
     database. Now provisions the same 5-status default set
     (Present/Absent/Late/Half Day/On Leave, Present as default) every
     institution needs.
  2. It created the `management`/`teacher`/`librarian`/`parent`/`student`/
     `staff` role ROWS but granted them ZERO `role_permissions` — every
     non-`institution_admin` user at KEMHS and MMP (including the 3 real
     teacher accounts provisioned in the previous phase) could log in but
     do nothing at all in the app. Now grants the same default permission
     sets `seed.ts` already gave its demo institutions
     (`DEFAULT_ROLE_PERMISSION_GRANTS`, kept in sync with `seed.ts`'s own
     `roleGrants`). Both gaps were backfilled directly in production for
     Badrudhuja/KEMHS/MMP (see git history / audit log for the exact SQL);
     new institutions get both automatically from here on.
- **"Present by default" needed no new logic** — `AttendanceGridForm`
  already defaulted every student with no existing record to whichever
  `attendance_statuses` row has `is_default=true`; the dropdown just had
  no rows to default TO until bug #1 above was fixed.
- **New permissions**: `attendance.leave.apply` (parent/student — apply
  for leave) and `attendance.leave.review_own_class` (teacher — approve/
  reject leave ONLY for students in their own assigned class, enforced by
  `canReviewLeaveApplication()`/`isClassTeacherOfStudent()` in
  `modules/attendance/service.ts`, the same application-layer scoping
  shape as mentoring's "assigned mentor only" rule). `attendance.edit`
  (institution_admin/management) remains unrestricted.
- **Alert preview/edit/cancel/confirm flow**: `markAttendanceAction`
  saves attendance (unconditionally — data persistence never depends on
  whether an alert is ever sent) and returns
  `getAttendanceAlertCandidates()`'s list of every absent/late student for
  that class/section/date, each with a ready-to-edit default WhatsApp
  message. `AttendanceGridForm.tsx` renders this as an editable/
  per-row-excludable preview; "Cancel" just hides it (nothing to undo);
  "Confirm & send" calls `sendAttendanceAlertsAction` →
  `sendAttendanceAlerts()`, which sends exactly the (possibly hand-edited)
  messages via `notifyUser(..., channels:["whatsapp"])`.
- **WhatsApp sending — GREEN-API, not Meta Cloud API/Twilio**: chosen
  because it needs no business-account verification to start sending
  (pairs to a real WhatsApp number by QR code, like WhatsApp Web). New
  provider files (`services/notification/whatsapp-provider.ts` +
  `console-whatsapp-provider.ts` + `green-api-whatsapp-provider.ts`) mirror
  `email-provider.ts`'s exact provider-swap shape.
- **Per-institution, not one shared platform number** ("message for each
  institution should go from a number which is related to the institution
  which I will add for each institution"): GREEN-API ID
  Instance/API Token Instance are stored on `institutions` (migration
  0027: `whatsapp_green_api_id_instance`/`_token_instance`), set by the
  platform owner via Super Admin → institution detail (`WhatsAppConfigForm`
  — new "WhatsApp (GREEN-API)" section), NOT institution self-service —
  these are Prompt Innovations' own purchased instances, one per
  institution. `notifyUser()` resolves the CALLER's own institution's
  credentials and passes them explicitly into `getWhatsAppProvider()`,
  so institutions can never share or cross-send from each other's number.
  `GREEN_API_ID_INSTANCE`/`GREEN_API_TOKEN_INSTANCE` env vars remain only
  as a platform-wide FALLBACK (local dev/testing with one shared instance)
  — never used once an institution has its own configured. **Not yet
  configured for any real institution as of this writing** — every
  WhatsApp send currently records `notifications.status='skipped'`
  (logged to console instead) until real credentials are entered for each
  institution. A student's WhatsApp target number is `users.phone`,
  resolved via `students.user_id` — i.e. only students with a portal
  login (§137 follow-up "parent phone as password") can currently receive
  alerts; students without one show "No phone on file" in the preview and
  can't be sent to.
- **Per-class leave list**: `listLeaveApplicationsForClassOnDate()`
  replaces the old institution-wide leave list on the Attendance page once
  a class is selected — only leaves whose date range covers the selected
  date, for students currently enrolled in that class.
- **Parent portal "Apply for leave"**: new
  `app/(portals)/portal/parent/actions.ts` + `ApplyLeaveForm.tsx`. Resolves
  the caller's own `parentId` and re-verifies `isOwnChild()` server-side
  before ever calling `applyForLeave()` — same §Z portal-identity rule
  every other parent-portal action already follows; a parent can never
  apply leave for a child that isn't their own, even by guessing a
  studentId.
- **Principal/daily-overview visibility**: a new "Daily overview" section
  on the Attendance page, visible only to `attendance.edit` holders
  (institution_admin, and `management` — the "Principal / Management"
  system role, once it holds `attendance.edit` per
  `DEFAULT_ROLE_PERMISSION_GRANTS` above), from
  `getDailyAttendanceOverview()`: every class/section's
  enrolled/marked/present/absent/late counts for the day, plus a
  consolidated absentee name list.

## MMP data-integrity fixes (three bugs reported together: "even if MMP is
## SKSVB still subjects are seen not added... subjects should be visible in
## classes as well... MMP staff shows some glitch")

- **SKSVB provisioning never re-runs for an EXISTING institution.**
  `provisionSksvbDefaults()` (`services/super-admin/super-admin-service.ts`)
  only ever ran inside `createInstitution()`. MMP's `board` had been set to
  `'sksvb'` afterward via a direct SQL update (an earlier session), so it
  got zero classes/subjects/`class_subjects` from that function — the
  Classes UI correctly showed "no subjects" because there genuinely were
  none. **Fixed**: new `updateInstitutionBoard()` (mirrors
  `updateInstitutionStatus()`'s shape) — settable per-madrasa-institution
  from Super Admin → institution detail → new "Educational board" section
  (`BoardConfigForm`) — (re-)runs `provisionSksvbDefaults()` whenever the
  board is set to `sksvb`. Safe to run repeatedly: subjects/classes/
  `class_subjects` are all `on conflict do update` upserts, matched by
  name, never duplicated. MMP was backfilled directly in production
  (14 subjects, 12 classes incl. the previously-missing "11", 50
  `class_subjects` links) using the exact same upsert logic.
- **`class_subjects` was completely unused by the app layer** — for every
  institution, not just SKSVB ones. No read function, no UI, anywhere.
  **Fixed**: `listClassSubjects()`/`assignSubjectToClass()`/
  `removeSubjectFromClass()` in `modules/academic/service.ts`. Surfaced two
  places: (1) Academic Setup (`/academic`) gets a new "Subjects per class"
  section — add/remove subjects per class, `settings.manage`-gated, same as
  the rest of that page; (2) the Classes hub detail page
  (`/classes/[classId]`) shows each class's assigned subjects read-only
  (with a "(practical)" tag for `is_core=false` subjects like Qur'an &
  Hifz), linking back to Academic Setup to manage them.
- **"MMP staff shows some glitch" — a duplicate `users` row from a
  case-sensitivity bug.** Root cause: `users.email` only had a plain
  `unique` constraint (migration 0001), so `"Saalikms786@gmail.com"` (Anees
  Alavi's real, Supabase-Auth-linked account) and `"saalikms786@gmail.com"`
  (entered with different capitalization when he was added to the Staff
  directory) were treated as different emails — `createStaffMember()`'s
  plain `insert into users` succeeded and created a second, orphan,
  login-less `users` row. His `staff` row and all 3 `teacher_assignments`
  (class teacher, 3A/5A/12A) ended up pointing at that orphan row instead
  of his real logged-in account, so his class-teacher scoping silently
  wouldn't have worked, and the Staff Directory showed him as
  `has_login=false` (clicking "Create login" would have failed, since
  Supabase Auth already had that email registered case-insensitively).
  **Fixed at the data layer** (migration 0028: `create unique index
  users_email_lower_unique_idx on users (lower(email))`) so this can never
  recur for ANY of the four `insert into users` call sites (staff creation,
  student/parent portal provisioning, user management) — they already all
  shared the same `catch { throw friendly "already exists" error }` shape,
  so no code changes were needed there, just the stricter constraint.
  Anees Alavi's specific production data was repaired directly: his
  `staff`/`teacher_assignments`/`user_roles` rows were re-pointed from the
  orphan `user_id` to his real one, then the orphan `users` row (and its
  now-empty `user_institution_memberships`) was deleted. Verified no other
  institution had a similar case-only email collision before applying the
  new constraint.

## Academic Structure (Page 2) + Student Management (Page 3) follow-up

Two large user-specified page specs, implemented via migration 0032
(`database/migrations/0032_academic_structure_student_mgmt.sql`):
`classes.stage`, `students.photo_file_id` (+ FK), an index on
`exam_classes(institution_id, class_id)`, and `institutions.parent_portal_sections`
(jsonb), plus one new permission (`academic.promote`).

- **Class stage is now a real, admin-editable field**, not guessed. Classes
  used to be grouped into LP/UP/HS/HSS sections on the Classes hub purely
  by pattern-matching the class NAME (a numeric-name-guessing function).
  That's gone — `classes.stage` is a free-text column (any institution's
  own vocabulary, not an enum, same §K convention as everything else
  institution-configurable) set from a text input next to the name/sort
  order fields on Academic Setup's class form, and the Classes hub now
  groups by whatever `stage` actually contains: known stages first
  (LP/UP/HS/HSS), then any custom stage alphabetically, then "Other" last
  for classes with no stage set.
- **Classes hub detail page** (`/classes/[classId]`) gained: class
  strength (boys/girls/other counts for the current year's active roster,
  `getClassStrength()`), a "Parent" column on the student roster (joined
  via `student_parents`/`parents`, only when explicitly requested via
  `listStudentsForAdmin({ includeParentContact: true })` so the dozen
  other existing callers of that function are unaffected), an "Exams"
  section listing every examination that covers this class
  (`listExaminationsForClass()`, via `exam_classes`) with links straight
  to that exam's existing Result/Consolidated/Report-card pages — a
  deliberately thin link-out layer, not a new cross-exam data model, per
  the "just link to each exam's existing pages" scope decision — and new
  permission-gated Discipline/Skills & Achievements/Library sections,
  each scoped to students CURRENTLY enrolled in this class via a new
  optional `classId` parameter added to `listDisciplineRecords()`,
  `listAchievements()`, `listSkillSubmissions()`, and
  `listReadingRecords()` (all four: dynamic WHERE-clause building, joins
  through `student_enrollments where status = 'active'` — "this class's
  records" always means "students currently placed here", not a
  historical as-of-date lookup).
- **Bulk class promotion** (`/academic/promotion`, `academic.promote`
  permission): pick a class (+ optional section), preview every actively
  enrolled student with a suggested action
  (`getPromotionPreview()` — promote to the next-higher-`sort_order`
  class, or graduate if this is already the highest), override any
  student's action individually (promote/repeat/graduate/transfer_out/
  dropout, plus a target class+section for promote/repeat), then confirm
  once (`promoteClass()`). No new enrollment status or column was needed:
  `student_enrollments` already has one row per (student, academic year),
  so promoting/repeating a student is simply inserting a NEW row for the
  target year — the prior year's row is left completely untouched as
  permanent history. Only the three non-advancing outcomes mutate the
  CURRENT year's row, closing it out via the existing
  `exit_date`/`exit_reason` columns (`status` becomes
  `graduated`/`transferred`/`removed`). Re-running a promotion for a
  student who already has an active enrollment in the target year skips
  them (reported back in `skippedAlreadyEnrolled`) rather than creating a
  duplicate. `setCurrentAcademicYear()` flips which year is `is_current`
  (Academic Setup's "Archived" badge + a confirm-then-submit button on any
  non-current year) — "archiving" a year needs no separate flag; it just
  stops being current once a newer one is marked so, and every exam/
  attendance/enrollment row from it stays exactly where it was.
- **Student photo**: `students.photo_file_id` + `updateStudentPhoto()`,
  mirroring `updateInstitutionLogo()`'s exact ownership-check shape — a
  plain UPDATE naming an arbitrary existing file id would otherwise
  satisfy the FK regardless of which institution that file actually
  belongs to (files' RLS only protects the SELECT, not a raw UPDATE
  naming its id), so the file is re-SELECTed under the caller's own scoped
  institution context first and the update refused with a clear error
  otherwise. New `PhotoForm.tsx` (mirrors `LogoForm.tsx`) on the student
  detail page; the Students admin list gained a Photo column (falls back
  to an initial-letter avatar) and a "Login credentials" column showing
  `login_id / parent_phone` (the parent's phone doubles as the student
  portal login password — no separate password is ever stored).
- **Parent portal section visibility**
  (`institutions.parent_portal_sections`, a single jsonb config blob —
  same direct-column convention as `board`/`whatsapp_*` rather than a
  generic key/value settings table): seven independent toggles (results,
  attendance, discipline, achievements, library, skills, portfolio),
  admin-configurable from Settings (`ParentPortalSectionsForm.tsx`),
  defaulting to all-on. The parent portal page
  (`app/(portals)/portal/parent/page.tsx`) now reads this config and wraps
  every stat card and section accordingly, only fetching
  achievements/skills/library data when their toggle is on. Discipline
  visibility is driven by THIS toggle specifically — not the
  institution-wide `discipline.view` staff permission — passed as
  `Student360Scope.canViewDiscipline` to `getStudent360()`, since "can a
  parent see their OWN child's discipline record" is a different question
  from "can staff see every student's". `listAchievements()`,
  `listSkillSubmissions()`, and `listReadingRecords()` each gained a
  second optional trailing parameter (`studentId`, after `classId`) so the
  same functions serve both the class-page listing above and the parent
  portal's single-child scoping, without a second bespoke query per
  module.

Tests: `tests/integration/academic-structure-student-mgmt-flow.test.ts`
(21 tests) — the promotion workflow's five action branches and its
already-enrolled skip path, tenant isolation on the classId/studentId
listing filters (including that moving a student out of a class drops
them from that class's listings immediately), class strength counting,
the class-scoped examinations lookup, the student photo ownership-check
rejection, and parent-portal section config defaults/updates/tenant
isolation.

## Attendance (Page 4) follow-up

User-specified page spec for Page 4 "Attendance": take attendance and the
monthly register already existed from Phase 4/the earlier attendance
follow-up and needed no changes. The genuinely new work below required no
schema migration — every addition is a new query/service function or UI
wiring over existing tables (`leave_applications`, `attendance_records`,
`staff`, `students`).

- **Staff self-service leave, old admin-picks-a-name UI retired.** The
  `/staff` page's old "Staff leave" section (an admin/principal choosing a
  staff member from a dropdown and applying on their behalf) is gone
  entirely, per the user's explicit instruction ("old section is not
  required at all"). In its place, a new **My leave** section on
  `/attendance#my-leave` lets ANY staff member apply for their OWN leave —
  no applicant picker. `applyForOwnLeaveAction`
  (`app/(institution)/attendance/actions.ts`) resolves the caller's own
  `staff.id` server-side via the existing `getOwnStaffId()` (already used
  cross-module by `mentoring`/`analysis`), never trusting a client-
  submitted staffId, and deliberately requires no `attendance.*`
  permission — a librarian with zero attendance permissions can still
  apply for their own leave. The underlying `applyForStaffLeave()`/
  `listStaffLeaveApplications()`/`reviewStaffLeave()` functions in
  `modules/staff/service.ts` are untouched (still covered by
  `staff-flow.test.ts`) — only the `/staff` page's UI wiring to them was
  removed; `/staff` now just links over to `/attendance#my-leave`.
- **Class-teacher "sign-off" = the existing Approve action.** Per the
  user's own confirmation, no new "signed" field or extra step was added —
  approving a student's leave application on the Attendance page already
  is the class teacher's sign-off; only the UI copy was clarified.
- **Students still apply only via the parent portal** (existing,
  unchanged) — the user explicitly declined a second staff-side "apply for
  a student" form to avoid duplicating that flow.
- **Combined pending-leave review table**
  (`getPendingLeaveApplicationsForReviewer()`, new in
  `modules/attendance/service.ts`): one query joining `leave_applications`
  to both `students` and `staff→users` (resolving whichever name applies
  per row's `applicant_type`), reusing the existing
  `canReviewLeaveApplication()`/`isClassTeacherOfStudent()` scoping rules
  — unrestricted (`attendance.edit`) reviewers see every pending
  application, staff and student alike; scoped
  (`attendance.leave.review_own_class`) reviewers (class teachers) see
  only pending STUDENT leave for their own class, never any staff leave
  (staff leave review is principal-only by design, matching the user's
  spec: "principal for staff and class teacher for students"). Rendered
  read-only (no approve/reject) as a summary on the Dashboard, and with
  the existing Approve/Reject actions on the Attendance page itself — the
  same "Dashboard = summary, full page = action" convention already used
  for Mark Entry Status / Pass Rate Trend.
- **Attendance analytics — "growth and fall diagram, recent days."**
  `getInstitutionAttendanceTrend()` (new) groups `attendance_records` by
  date directly (not the monthly-granularity, manually-refreshed
  `mv_attendance_monthly` view — unsuited to a daily "recent days" chart),
  computing an institution-wide present-percentage per day and *omitting*
  days with zero records entirely (weekends/holidays/not-yet-taken) rather
  than showing a misleading 0%, mirroring the existing pass-rate-trend
  widget's `having count(...) > 0` convention. Rendered by a new shared,
  reusable server component, `app/components/AttendanceTrendChart.tsx`
  (plain CSS bars, no chart library — the same convention already
  established by the Dashboard's exam pass-rate-trend widget), dropped
  into all three places the user asked for: the Attendance page (full
  detail, 14 days), the Dashboard (compact, 10 days), and the Analysis hub
  (a one-line summary card derived from the same 14-day query, linking
  through to the Attendance page for the full chart).

Tests: `tests/integration/attendance-page4.test.ts` (10 tests) — a staff
member with zero attendance permissions applying for their own leave,
`listLeaveApplicationsForApplicant()` scoping to exactly one applicant's
own history, `canReviewLeaveApplication()` refusing staff-leave review for
a scoped class-teacher reviewer while allowing it for an unrestricted one,
`getPendingLeaveApplicationsForReviewer()`'s three visibility cases
(unrestricted sees all, scoped sees only their own class's student leave,
neither permission short-circuits to an empty list with no query),
`getInstitutionAttendanceTrend()` omitting untaken days rather than
showing 0%, and tenant isolation on all three new functions.

## Result (Page 6) follow-up

User-specified page spec for Page 6 "Result": Exam Results, Consolidated
Marks, and per-student Report Cards already existed from the Phase
sidebar-redesign work and needed only two small additions; "Result
Analysis (of selected exam)" — six breakdowns (school-wide, section wise,
grade wise, class wise, subject wise, teacher wise) — was the genuinely
new piece. No schema migration was needed: every addition reads existing
tables (`results`, `student_enrollments`, `grade_bands`,
`teacher_assignments`, `mv_exam_subject_stats`).

- **Exam Results table** (`/results`) now shows a **Date column** and
  lists exams in chronological order (earliest first, undated exams
  last) — a display-only re-sort of `listExaminations()`'s own array;
  the shared function's "most recently created" ordering is untouched
  since other pages (Examination setup, Home widgets) still rely on it.
- **Consolidated Marks** (`/results/[id]/consolidated`) gained a **class
  dropdown** (`ClassFilterForm.tsx`, `?classId=`), narrowing
  `getExaminationMarksMatrix()` (now takes an optional `classId`) to one
  of the exam's own covered classes — populated from a new
  `listClassesForExamination()`, so the dropdown only ever offers classes
  this exam is actually relevant to.
- **Result Analysis** — six new breakdowns added to the existing
  per-exam `/analytics` page (not a separate page, per the user's own
  choice, since that page already is "Result > Analysis... exam-specific
  pattern recognition" and the Results table already links to it):
  - **School-wide / Section wise / Class wise** (`getResultSchoolSummary()`,
    `getResultsBySection()`, `getResultsByClass()`, all new in
    `modules/analytics/service.ts`) read the `results` table directly —
    average %, student count, and a full grade distribution per group.
    Each student is attributed to the class/section they were actually
    enrolled in **during the exam's own academic year** (joined via
    `student_enrollments.academic_year_id = examinations.academic_year_id`,
    not today's current enrollment), so a student promoted since the exam
    took place still shows up under the class they actually sat it in —
    promotion's own convention of never rewriting a past year's
    enrollment row (§Page-2/3 follow-up) makes this join safe. Since
    `results` is written synchronously by `computeResults()`, these three
    are always live — no "Refresh analytics" needed, unlike the
    mv-based sections below.
  - **Grade wise** (`getResultsByGrade()`) groups by the exam's own
    letter grade bands (A+/A/B+/B/...) and, per the user's explicit
    request ("Top 5 each grade"), lists the top 5 students by percentage
    within each band — a `row_number() over (partition by grade_band_id
    order by percentage desc)` window query. Empty (not an error) for an
    examination with no grade scale configured.
  - **Subject wise** — the pre-existing Subject Comparison table, now
    with an explicit **Rank** column (average marks descending) added in
    the UI only, no service change.
  - **Teacher wise** (`getResultsByTeacher()`) attributes each
    `mv_exam_subject_stats` row to whichever `teacher_assignments` row
    covers that (subject, class, section) for the exam's own academic
    year, via `role_type = 'subject_teacher'` — reusing the mapping
    Staff > Teacher Assignments already collects, per the user's own
    choice, so no new data entry is required. This closes a gap the
    codebase had explicitly flagged and deferred back in Phase 5 (the
    original `getSubjectPerformanceIndicators()` doc comment: "this
    platform does not yet have a subject-teacher assignment table...
    once that mapping exists, wiring a teacher_id filter onto this same
    shape is a small addition, not a redesign"). A teacher teaching the
    same subject across multiple sections gets one aggregated row.
    Institutions with no teacher assignments set up simply get an empty
    list, not an error.
  - Every ranked breakdown (section/class/subject/teacher-wise) keeps
    this codebase's existing "neutral signal, requires management
    interpretation" framing (§N.5) — a plain `#1, #2...` rank number by
    average, never a "best/worst" label attached server-side.

Tests: `tests/integration/result-analysis-flow.test.ts` (9 tests) — a
2-section, 4-student exam fixture covering school/section/class-wide
average and grade-distribution math, section-wise ranking order,
grade-wise top-5-per-band (including band ordering), teacher-wise
attribution correctly including an assigned subject and excluding an
unassigned one, the empty-list case for a nonexistent examination id, the
Consolidated Marks class filter (unfiltered / own-class / unrelated-class
cases) plus `listClassesForExamination()`, and tenant isolation across
every new function.

## Environment variables reference

See `.env.example` for the full list with comments.
