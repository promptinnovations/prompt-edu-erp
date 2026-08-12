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
  (288 tests, run against real Postgres via PGlite) prove the data layer,
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
  to the nine functions the bulk importer calls
  (`createClass`/`createSection`/`createSubject` in
  `modules/academic/service.ts`; `createStudent`/`createParent`/
  `linkParentToStudent` in `modules/students/service.ts`;
  `createStaffMember` in `modules/staff/service.ts`; `createBook` in
  `modules/library/service.ts`; `submitAchievement` in
  `modules/achievements/service.ts`) — when provided, the function inserts
  against that client instead of opening a new one. Purely additive (every
  existing call site is unaffected), and covered by an integration test
  (`tests/integration/bulk-flow.test.ts`) that specifically deletes a
  referenced class between staging and confirming, forcing a mid-batch
  failure, and asserts the earlier row in the same batch is rolled back too.
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
- **SMS / WhatsApp / push notification channels have no provider at all**:
  the `channel` check constraint on `notifications` (migration 0017)
  already allows `sms`/`whatsapp`/`push` (§R.4 "push is a progressive
  enhancement"), and `notifyUser()` will happily accept a request for any
  of them, but every such request is recorded as `status='skipped'` —
  there is no Twilio/WhatsApp Business API/web-push integration in this
  build. Requesting one of these credentials from the user was out of
  scope for this phase; wiring a real provider in means adding a new
  file mirroring `email-provider.ts`'s shape, not a redesign.
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

## Environment variables reference

See `.env.example` for the full list with comments.
