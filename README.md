# PROMPT EDU ERP

**Prompt Innovations — Technology with Purpose.**

A multi-tenant educational technology platform. This repository contains the
**Phase 0 / Phase 1 foundation**: multi-tenancy, Row-Level-Security-enforced
institution isolation, roles/permissions, academic structure (classes,
sections, subjects), student profiles, i18n (English + Malayalam), and a PWA
shell — built exactly to the plan in `docs/ARCHITECTURE.md`.

Full architecture rationale, database ERD, module system design, roadmap,
and every other design decision live in **`docs/ARCHITECTURE.md`** — read
that first. This README only covers running what's been built so far.

## What works right now

```
Login → Institution context → Dashboard → Create class → Create section
  → Create subject → Create student (any language) → Enroll student
  → Create examination → Add exam subjects → Enter marks
  → Submit → Verify → Approve → Lock → Compute results & grades
  → Take attendance for a class/section/date → View attendance summary
  → Apply for student leave → Approve/reject leave application
  → Refresh analytics → View subject comparison & performance indicators
  → View student high/middle/low classification → View class attendance trend
  → Submit a skill activity → Verify/approve it (config-driven workflow)
  → Submit an achievement → Verify it → Approve it
  → Approving either auto-writes a score_event → Compute a student's
    consolidated (weighted academic/attendance/skills/achievements) score
  → Approving a skill/achievement also writes a portfolio timeline event
  → View a student's Student 360° (result, attendance, score, timeline)
  → Add a library book → Issue a copy to a student → Return it (with
    overdue fine calculation) → Submit/approve a reading review, which
    also feeds scoring + the portfolio timeline
  → Add a staff member (creates their user account + role in one step)
    → Mark daily staff attendance → Apply for/approve staff leave (same
    generic workflow as student leave) → Create a portion (syllabus)
    plan and log completion progress against it → Record a teacher
    observation → Assign a teacher to a class/subject
  → Record a discipline entry (positive or negative, institution-defined
    categories) → Log a character assessment, which also feeds the
    scoring engine's 'character' component → Author a mentoring note as
    an assigned mentor → View Student 360° with permission-gated open
    mentoring goals and active discipline flags
  → Add a parent/guardian and link them to a student → Provision a
    student or parent portal login (creates the account and links it in
    one step) → Sign in as that student/parent and land automatically on
    their own portal (never the admin app) → Student portal: view your
    own Student 360°, submit a skill activity or achievement as yourself,
    browse the library catalogue → Parent portal: pick among your own
    children (never someone else's) and view their Student 360°
  → Generate a built-in report (student roster, examination results,
    attendance summary, consolidated performance, library circulation) as
    a downloaded PDF or Excel file → View the institution's recent report
    generation log
  → Download a bulk-import template (classes, sections, subjects, students,
    parents, staff, library books, achievements) → Upload a filled .xlsx
    or .csv file → Preview validated/invalid/duplicate rows with specific
    error messages → Confirm to commit every valid row inside one real
    transaction → Export students/classes/subjects/staff to CSV or Excel
  → Publish an announcement to everyone or to specific role(s) → every
    targeted user gets an in-app notification (+ an email attempt, honestly
    marked "skipped" with no SMTP provider configured) → Approving/
    rejecting a staff leave application notifies the applicant → View your
    own notifications and unread count from the bell in the header, on
    every screen including both portals
  → Submit an achievement with an optional certificate upload → file is
    stored via LocalFileProvider (or SupabaseStorageProvider, if configured)
    behind one provider-agnostic FileService → view/download it from the
    Achievements table or the Storage admin page → trigger a byte-verified
    migration of every existing file to a chosen provider from that same page
  → Sign in as a platform Super Admin → create a new institution (generic
    system roles provisioned automatically, no demo/domain data), optionally
    setting that institution's first admin account (name, email, and a real
    password) in the same step, so it's immediately usable with no separate
    sign-up round trip → view live student/staff/user/file counts across
    every institution → change an institution's status
    (active/inactive/suspended/trial) → turn any optional module
    (examinations, attendance, library, skills, achievements, staff,
    discipline, mentoring) on or off for one specific institution — it
    disappears from that institution's navigation and its pages become
    unreachable, while every other institution is unaffected → open any
    institution's own console directly (an amber banner marks you as
    viewing on its behalf, with a one-click exit back to the Super Admin
    console) to use every module exactly as that institution's staff would,
    without needing a membership or role there yourself → view the
    platform-wide (cross-tenant) audit log, itself an audited action
  → As an institution admin, generate a login for a new colleague (email +
    full name), assign them one or more roles at once (e.g. Teacher +
    Librarian) → they sign up themselves at /login with that same email,
    nobody's password ever passes through an admin → edit anyone's role
    assignments later, or deactivate their access entirely (which actually
    blocks sign-in, not just a cosmetic flag) — self-service is blocked for
    your own account, so you can never accidentally lock yourself out
  → Every institution runs the same fixed indigo/violet/fuchsia gradient
    look, switchable between light and dark mode from the sidebar (or
    portal header) — no per-institution colour picker to maintain, one
    consistent, polished app for everyone
  → Each institution's own console is installable as its own app — visit
    your institution's URL (e.g. https://prompt-edu-erp.vercel.app/kemhs),
    sign in, then "Add to Home Screen"/"Install" from the browser, and it's
    added to your phone or desktop under your institution's own name and
    short code, not "PROMPT EDU ERP" → inside your console, only your own
    institution's name/logo is shown up top — "PROMPT EDU ERP" and
    "Prompt Innovations" appear only as a small credit line at the bottom
  → As a Super Admin, every institution row now shows its own shareable
    URL (e.g. https://prompt-edu-erp.vercel.app/kemhs) as soon as it's
    created, with a one-click Copy button and an Edit link to change the
    short code afterward — reserved words and duplicate codes are rejected
  → Sessions now stay signed in — closing and reopening the app (or
    letting it sit idle) returns straight to the dashboard instead of
    bouncing back to /login, as long as the session hasn't been
    explicitly signed out
  → The app now renders correctly on older Android/browser versions, not
    just the newest ones — a colour-format incompatibility that could
    silently break styling on older devices has been fixed
  → As an institution admin, see a "Finish setting up" checklist on your
    dashboard (add a class, enroll a student, invite a colleague, ...) —
    each item disappears the moment the real data behind it exists, no
    separate "mark complete" step, and anything not applicable can be set
    aside with "Not applicable / later" (still revisitable, never lost)
    until the whole checklist quietly disappears once everything's done
```

with full tenant isolation enforced by PostgreSQL Row Level Security,
verified by an automated test suite (`npm test`, 296 tests) that includes an
ID-enumeration fuzz test proving Institution A can never read, edit, or
delete Institution B's data, a full examination-workflow test proving the
mark approval pipeline, permission boundaries (a teacher can enter marks but
not approve them), and correction audit trail all work correctly, an
attendance-workflow test proving the daily marking grid, attendance summary
roll-up, and leave application/approval flow (with the same permission
boundaries — a teacher can mark attendance but not review leave applications),
an analytics-flow test proving the materialized-view rollups match a manual
calculation and that AnalyticsService's explicit institution filtering holds
even though the underlying materialized views have no RLS (Postgres doesn't
support RLS on matviews — see the note in
`database/migrations/0007_analytics.sql`), a performance-flow test proving
the skill-submission workflow correctly branches on each activity's own
approval_required config and that achievements cannot be approved before
they're verified, and a scoring-flow test proving the condition matcher
(min_/max_/equality + bonus formula + max_points cap) computes correctly,
that approving a skill submission or achievement auto-writes a score_event
through the real workflow (not a synthetic call), and that
ConsolidatedScoreService.compute() matches a manual weighted-sum
calculation against the seeded performance profile, a portfolio-flow
test proving unapproved submissions never reach the portfolio timeline,
approval is the single point that writes one, and Student360Service.get()
correctly composes enrollment/results/attendance/consolidated-score/
timeline data (and degrades to nulls rather than leaking data across a
tenant boundary), and a library-flow test proving per-copy availability
tracking through issue/return, overdue fine calculation against the
institution's configured rate and grace period, and that approving a
reading review (but not rejecting one) feeds both the scoring engine and
the portfolio timeline, exactly like skills and achievements, and a
staff-flow test proving createStaffMember() provisions a user account,
membership, role grant, and staff record together, that marking staff
attendance with a null period upserts correctly rather than duplicating
rows, that staff leave reuses the exact same leave_applications workflow
as student leave, that portion plan completion history is append-only
with listPortionPlans() always surfacing the most recent entry, and
tenant isolation across every new table (staff, portion_plans,
portion_completion, teacher_observations, teacher_assignments), and a
discipline-mentoring-flow test proving character assessments' normalized
average matches what the scoring engine's 'character' component actually
computes, that createMentoringRecord() always fixes mentor_id to the
ACTING staff member (never a caller-supplied value, and throws for a
non-staff caller), that listMentoringRecords()/getMentoringRecord() give
a view_all holder every record but a plain mentor only their own (with no
existence leak on a hidden record), that updateMentoringRecord() is
refused even for a view_all holder who isn't the assigned mentor, and
that Student360Service.get() stays backward-compatible (both new fields
null) when called without the new optional scope argument, and a
portal-flow test proving parent/student_parents linking, that provisioning
a portal account throws rather than silently re-linking an
already-provisioned student/parent, that listChildrenForParent() and
isOwnChild() never let one family see another's child, and that
resolvePortalDestination() sends every possible role combination to the
right place (a pure student/parent role to their portal, ANY other role —
even mixed with student/parent — to the admin app).

## Quick start (zero external accounts needed)

This project runs entirely locally out of the box, using an embedded
Postgres (PGlite — real Postgres compiled to WASM, no Docker/root needed) so
you can try it before creating a Supabase project.

```bash
npm install
npm run db:migrate
SEED_DEMO_INSTITUTION=true npm run db:seed   # creates a demo institution + admin user
npm run dev
```

Open http://localhost:3000, and sign in at `/login` with the email printed
by the seed script (`admin@badrudhuja.example`) — the dev sign-in has no
password by design (see `services/auth/dev-auth-provider.ts` — it is
hard-blocked in production unless you explicitly opt in, which you should
never do for real institution data).

## Running the tests

```bash
npm test                        # full suite
npm run test:tenant-isolation   # just the RLS/tenant-isolation suite
```

Both test files spin up their own isolated, in-memory Postgres instance —
no setup required.

## Connecting a real Supabase project (when you're ready)

1. Create a project at supabase.com (your `promptinnovations011@gmail.com`
   Google account works fine for signing up).
2. Copy `.env.example` to `.env.local` and fill in your project's URL, anon
   key, and service role key.
3. Set `DATABASE_URL` to your Supabase project's Postgres connection string.
4. Run `npm run db:migrate` and `npm run db:seed` again — same commands,
   now pointed at real Postgres instead of the local embedded one.
5. Remove `ALLOW_DEV_AUTH` if you ever set it, and delete/ignore
   `services/auth/dev-auth-provider.ts`'s usage — `getAuthService()` will
   automatically switch to `SupabaseAuthProvider` once the Supabase env vars
   are present.

See `docs/SETUP.md` for the full checklist and known follow-ups.



Staff module highlights (§D.4/§D.3/§D.12): `createStaffMember()` is the
single call that provisions a staff member end to end — a `users` row, an
institution membership, an optional role grant, and the `staff` record
itself — rather than requiring the caller to orchestrate four separate
steps. Staff attendance gets its own table (`staff_attendance`, §D.6,
since staff aren't tied to a class/section the way the student attendance
grid is) but reuses the exact same institution-configured
`attendance_statuses` catalogue; staff LEAVE deliberately reuses the
generic `leave_applications` workflow built in Phase 4
(`applicantType: 'staff'`) rather than the parallel-but-workflow-less
`staff_leave` table from migration 0006 — see docs/SETUP.md for why.
Portion (syllabus) plans and completion tracking (§D.12) follow the same
append-only-history pattern as `mark_change_history`/`skill_reviews`
elsewhere: a plan's current progress is always its most recent
`portion_completion` row, not a mutable percent column. Teacher
observations (§D.12) use a deliberately free-form `criteria_jsonb` rather
than a hard-coded rubric, matching §K's "no institutional rubric is ever
hard-coded" rule. Teacher assignments (§D.3) resolve the
subject-teacher-mapping gap flagged as a follow-up back in the Phase 5
analytics notes. Building this phase's staff directory also surfaced (and
fixed) two dormant RLS issues in the Phase 0 foundation migration: `users`
had no policy letting one institution member see another's name (fixed
with a narrowly-scoped, non-recursive `users_select_institution_colleague`
policy), and `INSERT ... RETURNING` against a table with a self-only
SELECT policy fails until the inserted row is independently visible —
both documented in the migration 0012 header and worth remembering if a
future module joins to `users` for the first time.



Discipline/character/mentoring highlights (§D.8, §F.4/§75, §F.5):
discipline_categories/character_attributes are institution configuration
exactly like every other `*_categories`/`*_types` table in this build —
"positive" discipline entries (e.g. helping a classmate) live in the same
table as negative ones, distinguished only by `is_positive`, never a
separate schema. Character assessments (a 1-5 rating per attribute per
period) feed the scoring engine's previously-unbuilt 'character'
component (`getNormalizedScore()`, §K.5) through a small
`getCharacterScoreAverage()` helper — Badrudhuja's own seeded performance
profile still doesn't include it (adding it is a `performance_components`
row away, not a code change, so existing weighted-score tests keep their
exact 60/15/15/10 expectations). Mentoring is the first module in this
build with an ownership rule stricter than a permission check: every
write resolves the ACTING user's own `staff.id` server-side and mentor_id
is never caller-suppliable, `listMentoringRecords()`/`getMentoringRecord()`
take an explicit `MentoringScope` so "assigned mentor only" visibility is
enforced in the query itself (not just at the permission-check boundary),
and `updateMentoringRecord()` deliberately refuses even a
`mentoring.view_all` holder who isn't the record's own mentor — per §F.5,
"view broadly" and "edit" are two different rights, not one. Student 360°
(§L.4) now surfaces permission-gated open mentoring goals and active
discipline flags through a new optional `scope` argument on
`getStudent360()`, kept backward-compatible (both fields simply come back
`null`) for every call site that predates Phase 11.



Parent/student portal highlights (§D.4, §Z): the master spec's literal
`students`/`parents` table definitions have no `user_id` column (unlike
`staff`, which has had one since migration 0001) — there was simply no way
for a "Student"/"Parent" system role account (both already seeded since
Phase 0) to be resolved back to their own record. Migration 0014 closes
that gap with a nullable, unique-when-set `user_id` on each table.
`modules/portal/service.ts` never trusts a client-supplied studentId/
parentId: every read resolves the caller's OWN id server-side
(`getOwnStudentId`/`getOwnParentId`) and a parent's "which child" selector
is checked against `isOwnChild()` before use, not taken from the query
string directly — the same application-layer-gate-on-top-of-RLS pattern
Phase 11 introduced for mentoring. Provisioning a portal account
(`provisionStudentPortalAccount`/`provisionParentPortalAccount`) reuses the
exact RLS-safe insert sequence Phase 10 had to work out for
`createStaffMember()` (plain INSERT, id generated client-side, no
`ON CONFLICT DO UPDATE` or immediate `RETURNING` against `users`) —
written once, now needed a second time, confirming it's a real pattern and
not a one-off workaround. Routing is two-layered: `loginAction()` sends a
pure student/parent role straight to `/portal/student` or `/portal/parent`
on sign-in, and the `(institution)` layout independently re-checks the
same thing on every request (`resolvePortalDestination()`), so a
bookmarked or typed admin URL can't be used to route around the portal —
whichever role set isn't exclusively student/parent always lands in the
general admin app, since that's a strict superset.

## Project structure

See `docs/ARCHITECTURE.md` §Z for the full rationale. Summary:

- `app/` — Next.js App Router pages, grouped by `(auth)` and `(institution)`
- `modules/` — one folder per domain module (academic, students, …)
- `services/` — core, module-agnostic services (auth, tenant, permissions, db, audit)
- `database/` — SQL migrations, seeds, and the migration/seed runner scripts
- `i18n/` — English + Malayalam message bundles
- `tests/integration/` — tenant isolation + foundation-flow test suites
- `docs/` — architecture and setup documentation

## Status

Phase 0/1 (foundation), Phase 3 (examination), Phase 4 (attendance),
Phase 5 (core analytics), Phase 6 (performance), Phase 7 (scoring engine +
consolidated performance), Phase 8 (student portfolio + Student 360°),
Phase 9 (library), Phase 10 (staff), Phase 11 (discipline, character,
mentoring), Phase 12 (parent/student portals), Phase 13 (reporting),
Phase 14 (bulk import/export), Phase 15 (communication), Phase 16
(file storage), Phase 17 (Super Admin console), and Phase 18 (production
hardening) are built — completing the full 18-phase roadmap (§AA). Phase
2's remaining piece (academic years/terms) shipped alongside Phase 3 since
exams depend on it.

**Phase 18** added: server-side file upload validation (size/type,
regardless of client claims), edge rate limiting on auth and bulk-write
endpoints (`middleware.ts`), security headers, a build-time secret-leak
scanner wired into CI (`.github/workflows/ci.yml`), a working ESLint flat
config (fixing a real, previously-broken lint pipeline), and
`docs/SECURITY.md`/`docs/DEPLOYMENT.md` documenting the full security
posture and a production go-live checklist — see both for an honest
accounting of what's implemented versus a documented follow-up.

**Post-Phase-18 follow-ups (in progress, per docs/SETUP.md):** institution
`status` (suspend/deactivate) is now enforced at sign-in/write time
(`services/request-context.ts`'s `resolveInstitutionBlockedReason()`), and
`LimitService` (§W.2) now checks live usage against each institution's
subscription plan (`services/limits/limit-service.ts`), refusing the
specific student/staff/file-upload action that would exceed a hard cap
while never retroactively touching existing data. Remaining follow-ups are
tracked in `docs/SETUP.md`.

**Phase 16 note — Google Drive was intentionally dropped.** The original
architecture draft named Google Drive as a possible storage provider
alongside Local/Supabase. It is deliberately NOT implemented here: only
`local` and `supabase` are wired up (`services/storage/storage-provider.ts`),
and the `googleapis` package is not a dependency. The storage abstraction
(`FileService`/`StorageProvider`) is provider-agnostic by design specifically
so a `google_drive` provider can be added later with zero change to any
calling module — see "Adding Google Drive later" in `docs/SETUP.md` for the
concrete steps.

Examination module highlights: institution-configurable exam types and
grading scales (never hard-coded — §K), a mark workflow with an audit trail
(`draft → submitted → verified → approved → locked`, with corrections to
already-approved marks tracked in `mark_change_history` rather than silently
overwritten), and results/grade computation that only counts approved marks
and skips students with incomplete results rather than showing a misleading
partial total.

Attendance module highlights: institution-configurable attendance statuses
(`attendance_statuses` — never a hard-coded Present/Absent enum, §K), a daily
per-class/section marking grid mirroring the marks-entry UX, a student
attendance summary roll-up (present/absent/late days and percentage over a
date range), and a leave application workflow (apply → approve/reject) with
the same permission-gated review pattern as mark approval.

Analytics module highlights: a proper aggregation layer (§N.1) — two
materialized views (`mv_exam_subject_stats`, `mv_attendance_monthly`) that
dashboards read from instead of rescanning raw marks/attendance rows on every
page load, a manual refresh action (scheduled/on-write-event refresh is a
tracked follow-up once a job runner exists), institution-configurable
high/middle/low achiever thresholds (`classification_rules`, §N.4 — no
threshold is ever hard-coded), and subject-level performance indicators
framed neutrally per §N.5 rather than as a scored verdict (per-teacher
attribution is intentionally deferred until the staff/subject-assignment
mapping lands in a later phase). One explicitly documented architecture
deviation: Postgres does not support RLS on materialized views, so
`AnalyticsService` is the sole sanctioned reader of those two views and is
the only enforcement gate for institution isolation at that layer — see the
note in `database/migrations/0007_analytics.sql`.

Performance module highlights: config-driven skill submission workflow
(`skill_types`/`skill_activities` per institution, §D.7) where each
activity's own `evidence_required`/`verification_required`/
`approval_required` flags decide whether a submission needs one review step
or two — `reviewSkillSubmission()` branches on that config rather than
assuming every activity behaves the same way — and an achievement pipeline
(submit → verify → approve, with separate `verified_by`/`approved_by`
columns and permissions so one person confirming a record is genuine and a
different person signing off on it counting are independently enforced,
never skippable — `approveAchievement()` refuses an unverified record).

Scoring engine highlights (§K): a single generic evaluator
(`evaluateScoring()`) reads `scoring_rules` rows and matches submission data
against `condition_jsonb` using a deliberately constrained, auditable
predicate language (`min_<field>`/`max_<field>`/equality — never a full
expression language, §K.3), applies a configurable bonus formula, and caps
at `max_points` — Badrudhuja's own point values (§K.4) are the first row set
in that table, not special-cased logic. Approving a skill submission or
achievement automatically evaluates/records a `score_events` row through the
real approval workflow, and `ConsolidatedScoreService.compute()` (§K.5)
produces a weighted roll-up across academic/attendance/skills/achievements
components — each normalized to 0-100 by reusing the relevant module's own
service rather than re-deriving the numbers. "Character" and "activities"
components from the master spec's example weighting are intentionally
omitted for now, since discipline/mentoring and clubs/events aren't built
yet — adding either later is a `performance_components` row, not a code
change.

Portfolio module highlights (§L): `portfolio_events` is an append-only,
event-sourced log (§L.1) that references authoritative records
(`entity_type`/`entity_id`) instead of duplicating them — marks stay in
`marks`, achievements stay in `achievements`. `recordPortfolioEvent()` is
the single point a row is ever written (§L.3), called only from an approval
workflow (skill submission approval, achievement approval) — an unapproved
submission simply never appears, by construction, not by a status filter
applied inconsistently across call sites. `getStudent360()` (§L.4) is a
pure composition service — it fans out to existing module functions
(current enrollment, latest exam result, attendance summary, latest
consolidated score, recent portfolio timeline) rather than maintaining a
new denormalized table, and degrades to nulls for a student with no data
yet instead of erroring. Mentoring goals and discipline flags from the
spec's Student 360° description are deferred until Phase 11 builds those
modules.

Library module highlights (§D.11, §M): availability is tracked per
PHYSICAL copy (`book_copies`), not per title, so two students can each hold
a different copy of the same book. Loan period, fine-per-day, and grace
days are institution configuration stored in the existing `module_configs`
table (§I) rather than new bespoke columns. Returning a book creates a
`reading_records` row either way — `pending` if the institution requires a
review, `not_required` if it doesn't — so reading-frequency analytics stay
accurate even where no review workflow is configured (§M.3). Approving a
reading review reuses the exact same scoring-engine and portfolio wiring
built for skills and achievements, rather than a bespoke library-specific
path — the whole point of `evaluateScoring()`/`recordPortfolioEvent()`
being generic, module-agnostic functions (§K.1, §L.3).

Reporting engine highlights (§D.13, §P): one generic `generateReport()`
orchestrator (§P.1) — resolve a `report_definitions` row by code, run its
`base_query_key`'s registered query function, render to PDF (pdfkit) or
XLSX (exceljs), log a `reports` audit row — rather than bespoke
generate/download code per report type. The query registry (§P.2) is the
"never raw SQL exposed to end users" safeguard: every entry is a named
TypeScript function that calls the SAME institution-scoped,
permission-checked service functions every other page already calls
(`getResults()`, `getStudentAttendanceSummary()`, `listConsolidatedScores()`,
`listIssuedBooks()`), not a raw SQL template string. The five built-in
reports are seeded, global (`institution_id is null`) catalogue rows —
adding a sixth is one query-registry function plus one seed row, not a new
code path. Reports are generated live and streamed straight to the HTTP
response; nothing is persisted (`reports.file_id` stays null in this
build), so re-downloading means re-running the query, not re-fetching a
stored file. One documented, deliberate limitation: the XLSX renderer
supports every target script (Arabic/Malayalam/Urdu/Devanagari/Kannada)
for free since Excel renders Unicode client-side, but the PDF renderer
(pdfkit's standard 14 fonts) is Latin-only — a non-Latin student name in a
PDF report currently renders blank/tofu for that name (see `docs/SETUP.md`).

Bulk import/export highlights (§Q): `stageImport()`/`confirmImport()` (§Q.1)
mirror the reporting engine's registry pattern — an `EntityImportDefinition`
per entity (classes, sections, subjects, students, parents, staff, library
books, achievements) with a `parseRow()` that runs the exact same field,
type, referential (does this class/student/category actually exist in this
institution?), and duplicate (both within-file and against real DB rows)
checks a human reviewing a spreadsheet would want, before any row is ever
committed. Every `insertRow()` calls the SAME service function manual entry
uses (`createStudent()`, `createStaffMember()`, ...) — "one schema, two
entry points" (§Q.1), never a parallel bulk-only code path. Making
`confirmImport()` genuinely transactional (§Q.1 "any row-level failure
rolls back that batch") surfaced a real architectural gap: those service
functions each open their OWN `withInstitutionContext()`/transaction
internally, so calling them back-to-back from a loop does **not**, on its
own, share one transaction. Fixed by adding an optional trailing
`scopedClient` parameter to each of the nine functions the bulk importer
calls (`createClass()`, `createSection()`, `createSubject()`,
`createStudent()`, `createParent()`, `linkParentToStudent()`,
`createStaffMember()`, `createBook()`, `submitAchievement()`) — when
provided, the function runs its INSERT against that client instead of
opening a new one, so `confirmImport()`'s own transaction now truly wraps
every row in the batch; a mid-batch failure rolls back rows that had
already "succeeded" earlier in the same loop, not just the failing row.
Covered explicitly by an integration test that stages two valid rows,
deletes the referenced class out from under the second one before
confirming, and asserts the first row's insert is rolled back too. Exports
(§Q.2) reuse the same permission-checked module `list*()` functions as
their corresponding screens — an export can never return more than the
exporting user is authorized to view.

Communication highlights (§D.13, §G.4): NotificationService
(`services/notification/notification-service.ts`) is a genuinely CORE,
module-agnostic service — `notifyUser()` is the one place a `notifications`
row is ever written, and it's called from both the new announcements
module AND an EXISTING workflow (`reviewLeaveApplication()` in
`modules/attendance/service.ts`), proving the "core service every module
can depend on" claim rather than just asserting it. Every call always
creates an `in_app` row (a database insert can't meaningfully "fail" to
notify) and, by default, an `email` row whose actual delivery depends on
which `EmailProvider` is configured — `ConsoleEmailProvider` (default; logs
and honestly records `status='skipped'`, never a false "sent") or
`SmtpEmailProvider` (real nodemailer delivery, selected automatically once
`SMTP_HOST` is set), mirroring `AuthService`'s dev/production provider-swap
pattern exactly. `sms`/`whatsapp`/`push` channels are schema-ready (the
`channel` check constraint already allows them, per §R.4's "push is a
progressive enhancement") but have no provider built this phase — every
request for one is recorded as `status='skipped'`, an honest placeholder
rather than a silent no-op. Notification "ownership" (a user only ever
reads their own inbox) is enforced the same way mentoring's confidentiality
and the student/parent portal's self-scoping already are (§X) — in the
application layer, via a server-resolved userId, never a client-supplied
notification id or RLS alone. Announcements target an audience resolved
server-side to a concrete list of `user_id`s ("everyone with an active
membership" or "everyone holding a given role") and fan out inside ONE
transaction, reusing the `scopedClient` pattern Phase 14 introduced for
bulk import's `confirmImport()`.
