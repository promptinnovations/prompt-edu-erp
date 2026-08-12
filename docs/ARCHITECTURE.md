# PROMPT EDU ERP — Architecture Phase Document

**Prompt Innovations — Technology with Purpose.**

Status: Architecture phase (no implementation started). First tenant reference: Badrudhuja Islamic Centre.
Document owner: Lead Architecture role (Claude), for Muhsin / Prompt Innovations.
Version: 1.1 — Draft for review (v1.1 updates the multilingual scope in §S per Muhsin's clarification: English-only UI at launch, Malayalam added as a second switchable UI language for institutions that want it, full Unicode data-entry support in all six target languages regardless of UI language).

> Note on inputs: This document is built from the Master Development Prompt (all 108 sections) and the Badrudhuja-specific functional details embedded in it (§42), which is the only Badrudhuja proposal content made available in this workspace. If a fuller standalone "Badrudhuja Software Development Proposal" document exists, share it and this document's Badrudhuja configuration examples (§K, §L, §M) will be reconciled against it before Phase 1 begins. Nothing below hard-codes Badrudhuja logic into the platform — all Badrudhuja specifics are expressed as example tenant configuration, never as core code paths.

## Table of Contents

A. System Architecture
B. Multi-Tenant Architecture
C. Database ERD
D. Complete Table Structure
E. Institution Isolation Strategy
F. Roles & Permissions Matrix
G. Module Architecture
H. Module Assignment Architecture
I. Module Configuration Architecture
J. Custom Module Future Architecture
K. Scoring Engine Architecture
L. Student Portfolio Architecture
M. Library Architecture
N. Analytics Architecture
O. Pattern Recognition Architecture
P. Reporting Architecture
Q. Bulk Import/Export Architecture
R. PWA Architecture
S. Multilingual / RTL Architecture
T. Storage Abstraction
U. Google Drive Migration Strategy
V. Supabase → Neon Migration Strategy
W. Super Admin Usage Architecture
X. Security Architecture
Y. Audit Architecture
Z. Project Folder Structure
AA. Development Roadmap
AB. Testing Strategy
AC. Risks and Architectural Decisions

---

## A. System Architecture

### A.1 High-level shape

PROMPT EDU ERP is a single Next.js application (frontend + backend via server actions/route handlers) sitting on a shared PostgreSQL database (Supabase-hosted initially), with three logical planes:

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  Web (responsive) · PWA (installable) · Mobile-optimized views   │
└───────────────────────────────┬─────────────────────────────────┘
                                 │ HTTPS (TLS)
┌───────────────────────────────▼─────────────────────────────────┐
│                     APPLICATION LAYER (Next.js)                  │
│  App Router · Server Actions/Route Handlers · Middleware         │
│  ┌───────────────┐ ┌────────────────┐ ┌───────────────────────┐  │
│  │ Auth Context   │ │ Tenant Context │ │ Permission Guard      │  │
│  │ (session)      │ │ (institution)  │ │ (RBAC/permissions)    │  │
│  └───────────────┘ └────────────────┘ └───────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  MODULE ENGINE  (Academic, Attendance, Library, Skills…)   │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  CORE SERVICES: Scoring · Portfolio · Analytics · Reports  │  │
│  │  Notification · Audit · Search · Approval Workflow ·       │  │
│  │  File Storage (abstracted) · Import/Export                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                 │
┌───────────────────────────────▼─────────────────────────────────┐
│                        DATA LAYER                                 │
│  PostgreSQL (Supabase) with Row Level Security                    │
│  Auth provider (Supabase Auth) · Object storage (Supabase Storage)│
│  Background jobs (queue) · Materialized views for analytics       │
└─────────────────────────────────────────────────────────────────┘
```

### A.2 Why Next.js + a modular monolith (not microservices, initially)

A single, well-layered Next.js application ("modular monolith") is the right starting point: one deployable unit, one database, but strict internal module boundaries (see §G). Microservices would add operational overhead (service discovery, distributed transactions, network security between services) that is not justified before there is real multi-institution load. The module engine and service layer are designed so that any module could later be extracted into its own service without a data-model rewrite, because modules already communicate through defined interfaces/events rather than reaching into each other's tables directly.

### A.3 Layering rules (enforced by folder structure and code review, see §Z)

1. **Presentation** (`app/`, `components/`) never talks to the database directly — only to services.
2. **Modules** (`modules/*`) own their own domain logic and expose a narrow public API (functions + emitted events). A module must not import another module's internal files, only its public API.
3. **Core services** (`services/*`) are shared, module-agnostic capabilities: auth, tenant resolution, permissions, storage, notifications, reporting, analytics, audit, search, workflow.
4. **Database access** (`database/*`) is the only layer allowed to run SQL/query builder calls. All queries are tenant-scoped by construction (see §E).

### A.4 Request lifecycle (server-enforced tenant + permission check)

```
Incoming request
   → Middleware: verify session (Supabase Auth JWT)
   → Resolve institution_id from the authenticated user's server-side
     membership record (NEVER from client-supplied header/body/query)
   → Load user's role(s) + permissions for that institution
   → Route handler / Server Action calls a service function
   → Service function calls database layer with institution_id bound
     from step above (defense in depth on top of RLS, see §E)
   → Database enforces RLS policy as a second, independent gate
   → Response
```

This "resolve-on-server, enforce-twice" pattern (application-layer scoping **and** Postgres RLS) is the backbone of tenant isolation — see §E for detail.

### A.5 Core architectural decisions at a glance

| Decision | Choice | Rationale |
|---|---|---|
| Frontend/backend framework | Next.js (App Router) + TypeScript | Single codebase, server components reduce client bundle, strong typing across the stack |
| Database | PostgreSQL | Relational integrity, RLS, JSON columns for flexible config, portability |
| Initial backend platform | Supabase (Auth, Postgres, Storage) | Fast start, free tier, Postgres-native (portable later) |
| Multi-tenancy model | Shared database, shared schema, `institution_id` + RLS | Scales to thousands of small/medium institutions without per-tenant infra cost; large tenants can be split out later (§A.6) |
| Auth | Supabase Auth, abstracted behind an `AuthService` | Avoids hard dependency on Supabase-specific auth calls scattered through the app |
| Storage | Supabase Storage, abstracted behind a `FileService` | Enables later Google Drive migration without touching domain tables |
| State/config | Config-driven modules (DB-stored JSON schema + rules), not code branches | Central non-negotiable principle: configuration over hard-coding |
| Background work | Job queue (initially Postgres-backed, e.g. `pgmq`/simple jobs table + cron) | Cheap to start, portable, upgradeable to a real queue later |

### A.6 Scale path (shared → dedicated)

```
Institution created → shared schema, shared Postgres project (default)
        ↓ (if institution crosses configurable thresholds: students,
            storage, or requests — see §W)
Super Admin marks institution "dedicated-eligible"
        ↓
Migration job copies institution's rows (filtered by institution_id)
into its own Postgres project/database, using the same schema
        ↓
Institution's `institutions.deployment_mode` flips to `dedicated`
and its connection routing entry points at the new database
        ↓
Application layer resolves the correct database connection per
request using a small connection-routing table, keyed by institution_id
```

Because every tenant-owned table already carries `institution_id` and the schema is identical across shared and dedicated deployments, this migration is a data-copy operation, not a redesign.

---

## B. Multi-Tenant Architecture

### B.1 Model chosen: Shared database, shared schema, row-level isolation

Three standard multi-tenancy models were considered:

| Model | Isolation strength | Ops cost per tenant | Cost at 1,000+ tenants | Chosen? |
|---|---|---|---|---|
| Separate database per tenant | Strongest | High (migrations ×N, connections ×N) | Prohibitive on free/low-cost tiers | No (reserved for large-tenant escape hatch, §A.6) |
| Separate schema per tenant, shared DB | Strong | Medium (migrations ×N schemas) | Difficult past a few hundred tenants | No |
| Shared schema, `institution_id` column + RLS | Application-managed, backed by DB policy | Low (one migration for all tenants) | Scales well; proven pattern | **Yes** |

Shared schema is the only model that lets "1 institution, 10, 100, 1,000+" run on one codebase and one set of migrations without linear operational cost growth, which is a non-negotiable requirement (§107.2).

### B.2 Tenant identity

```
institutions
  id (uuid, PK)
  code            -- short slug, e.g. "badrudhuja", used in subdomain
  name
  legal_name
  type            -- madrasa | islamic_school | school | college | dars | other
  status          -- active | inactive | suspended | trial
  deployment_mode -- shared | dedicated
  plan_id (FK -> subscription_plans, nullable in v1)
  timezone
  default_locale
  created_at, updated_at
```

Every other tenant-owned table carries `institution_id uuid not null references institutions(id)`.

### B.3 Tenant resolution strategy

A user's `institution_id` is never taken from the client. It is resolved server-side from:

1. The authenticated session (Supabase Auth `user.id`) →
2. A `user_institution_memberships` row (a user can belong to more than one institution, e.g. a parent with children in two institutions, or a consultant) →
3. The **active institution** for that session, selected from the user's memberships and stored server-side (session claim / server cookie), switchable via an explicit "switch institution" action that re-validates membership.

Subdomain/domain (see §92) is a **UX hint**, not a security boundary — e.g. `badrudhuja.prompt-edu-erp.com` pre-selects the institution context at login, but the actual authorization check always re-derives `institution_id` from the verified membership, never from the hostname alone.

### B.4 Super Admin exception

Super Admin users are platform-level and are not scoped to a single `institution_id`. They operate through a separate, clearly isolated set of routes/services (`app/(super-admin)/…`) that explicitly select an institution to act on, with every cross-tenant action written to the audit log (§Y). Super Admin RLS policies are additive/explicit grants, never a blanket bypass baked into every table policy.

---

## C. Database ERD

Textual ERD grouped by domain (full column-level detail in §D). Arrows read "has many" unless noted.

```
institutions ──< institution_settings
institutions ──< institution_modules >── modules (module library, platform-level)
institutions ──< subscription (plan_id → subscription_plans)
institutions ──< users (via user_institution_memberships)
institutions ──< academic_years ──< terms
institutions ──< classes ──< sections
institutions ──< subjects ──< class_subjects >── classes/sections
institutions ──< teacher_assignments >── users, classes, sections, subjects

institutions ──< students ──< student_enrollments >── classes, sections, academic_years
institutions ──< parents ──< student_parents >── students
institutions ──< staff (users with staff profile)

institutions ──< examinations ──< exam_subjects >── subjects
exam_subjects ──< marks >── students
marks ──< grades (derived, via grade_scales)

institutions ──< attendance_records >── students, classes, sections
institutions ──< leave_applications >── students/staff

institutions ──< skill_activities (config) ──< skill_submissions >── students
skill_submissions ──< skill_reviews (approval)

institutions ──< achievement_categories, achievement_levels (config)
achievement_categories ──< achievements >── students

institutions ──< scoring_rules >── modules
scoring_rules ──< score_events >── students (computed/consolidated)

institutions ──< portfolio_events >── students (aggregation of approved events
                                                  from every module)

institutions ──< books ──< book_copies
books >── authors, publishers, categories, shelves
book_copies ──< book_issues ──< book_returns
book_issues ──< reading_records ──< portfolio_events

institutions ──< mentoring_records >── students, staff
institutions ──< discipline_records >── students
institutions ──< character_assessments >── students

institutions ──< notifications >── users
institutions ──< files >── (polymorphic owner: any module record)
institutions ──< audit_logs >── users
institutions ──< usage_metrics (rollup, per institution per period)
institutions ──< approvals >── (polymorphic: skill_submissions, achievements,
                                              reading_records, leave, marks…)

roles ──< role_permissions >── permissions
users ──< user_roles >── roles (scoped per institution_id)
```

Key modeling principles visible in the ERD:

- **Polymorphic-but-typed** join points (`files`, `approvals`, `portfolio_events`) use an `entity_type` + `entity_id` pair rather than dozens of nullable foreign keys, so new modules can plug into files/approvals/portfolio without schema changes.
- **Config tables vs transaction tables** are separated everywhere (e.g. `skill_activities` config vs `skill_submissions` transactions; `achievement_categories`/`achievement_levels` config vs `achievements` transactions; `scoring_rules` config vs `score_events` computed results). This is what makes "configuration over hard-coding" real at the schema level, not just in application code.
- **Portfolio is derived**, not a duplicate data store (§L, §89 of the spec) — `portfolio_events` stores lightweight event rows that reference the authoritative record (`entity_type`/`entity_id`) rather than copying full payloads.

---

## D. Complete Table Structure

This is the initial normalized design direction (per spec §88, "refine during architecture design, not a command to build blindly"). Common audit columns `created_at, updated_at, created_by, updated_by` are omitted from each listing below for brevity but apply to every transactional table; `institution_id` is shown explicitly since it is the isolation key.

### D.1 Platform

```
institutions(id, code, name, legal_name, type, status, deployment_mode,
             plan_id, timezone, default_locale, logo_file_id, favicon_file_id,
             primary_color, secondary_color, app_name, welcome_message)

institution_settings(id, institution_id, key, value_jsonb)
  -- generic key/value config store for anything not worth its own column
  -- e.g. { "attendance_default_status": "present",
  --        "exam_eligibility_attendance_pct": 60,
  --        "enabled_ui_languages": ["en", "ml"] }

subscription_plans(id, name, max_students, max_staff, max_users, max_storage_mb,
                    max_modules, features_jsonb, is_active)

modules(id, code, name, description, category, is_core, is_active)
  -- platform-level catalogue: "academic", "library", "reading", "quran", …

institution_modules(id, institution_id, module_id, is_enabled, enabled_at,
                     enabled_by)

module_configs(id, institution_id, module_id, config_key, config_value_jsonb)
  -- Level 2 customization: per-institution settings for an enabled module

platform_audit_logs(id, actor_user_id, institution_id nullable, action,
                     entity_type, entity_id, before_jsonb, after_jsonb,
                     ip_address, user_agent, created_at)

usage_metrics(id, institution_id, period_start, period_end, student_count,
              staff_count, parent_count, user_count, storage_bytes,
              file_count, record_count, active_user_count, api_request_count,
              imports_count, exports_count, reports_generated_count)
```

### D.2 Identity, roles, permissions

```
users(id, auth_user_id [Supabase auth uid], email, phone, full_name,
      preferred_locale, status, last_login_at)

user_institution_memberships(id, user_id, institution_id, status,
                              is_primary)

roles(id, institution_id nullable [null = platform role, e.g. super_admin],
      code, name, is_system_role)
  -- system roles seeded per institution on creation: institution_admin,
  -- management, teacher, staff, librarian, parent, student
  -- institutions may add custom roles (non-negotiable §23 "future custom roles")

permissions(id, code, module, description)
  -- e.g. "student.view", "marks.enter", "library.issue"

role_permissions(id, role_id, permission_id)

user_roles(id, user_id, institution_id, role_id)

audit_logs(id, institution_id, user_id, action, module, entity_type,
           entity_id, before_jsonb, after_jsonb, ip_address, user_agent,
           created_at)
```

### D.3 Academic structure

```
academic_years(id, institution_id, name, start_date, end_date, is_current)
terms(id, institution_id, academic_year_id, name, start_date, end_date)

classes(id, institution_id, name, sort_order, academic_stream nullable)
sections(id, institution_id, class_id, name, capacity)

subjects(id, institution_id, code, name, category)
class_subjects(id, institution_id, class_id, subject_id, is_core)

teacher_assignments(id, institution_id, user_id [teacher], class_id,
                     section_id nullable, subject_id nullable,
                     academic_year_id, role_type)
  -- role_type: class_teacher | subject_teacher
```

### D.4 People

```
students(id, institution_id, admission_number, full_name, full_name_native,
         photo_file_id, date_of_birth, gender, contact_phone, contact_email,
         address, status [active|transferred|withdrawn|graduated])

student_enrollments(id, institution_id, student_id, academic_year_id,
                     class_id, section_id, enrollment_date, status,
                     exit_date nullable, exit_reason nullable)
  -- history across years; "current" resolved via academic_year_id = current

parents(id, institution_id, full_name, phone, email, occupation nullable)
student_parents(id, institution_id, student_id, parent_id, relationship,
                 is_primary_contact)

staff(id, institution_id, user_id, staff_code, designation, department,
      joining_date, employment_status)
```

### D.5 Examination & marks

```
exam_types(id, institution_id, code, name)
  -- institution-defined, e.g. Kithab Main, Kithab Model, Academic Main
  -- (Badrudhuja config example, not a platform-wide table of fixed values)

examinations(id, institution_id, exam_type_id, academic_year_id, term_id,
             name, start_date, end_date, status
             [draft|scheduled|in_progress|completed|locked])

exam_classes(id, institution_id, examination_id, class_id, section_id)

exam_subjects(id, institution_id, examination_id, subject_id, max_marks,
              pass_marks, weight nullable)

marks(id, institution_id, exam_subject_id, student_id, marks_obtained,
      is_absent, remarks, entry_status [draft|submitted|verified|approved|
      locked], entered_by, verified_by, approved_by)

mark_change_history(id, institution_id, mark_id, old_value, new_value,
                     changed_by, reason, changed_at)

grade_scales(id, institution_id, name, is_default)
grade_bands(id, institution_id, grade_scale_id, min_percent, max_percent,
            grade_label, grade_point nullable)

results(id, institution_id, examination_id, student_id, total_marks,
        percentage, grade_band_id, rank nullable, status)
```

### D.6 Attendance & leave

```
attendance_statuses(id, institution_id, code, label, counts_as_present,
                     is_default)
  -- default row: code=present, is_default=true (non-negotiable §36)

attendance_records(id, institution_id, student_id, class_id, section_id,
                    date, status_id, is_late, late_minutes, marked_by)

leave_applications(id, institution_id, applicant_type [student|staff],
                    applicant_id, start_date, end_date, reason,
                    status [pending|approved|rejected], reviewed_by,
                    reviewed_at)

staff_attendance(id, institution_id, staff_id, date, period nullable,
                  status_id, marked_by)
staff_leave(id, institution_id, staff_id, start_date, end_date, reason,
            status, reviewed_by)
```

### D.7 Skills, achievements, activities

```
skill_types(id, institution_id, code, name)   -- reading, writing, speaking…
skill_activities(id, institution_id, skill_type_id, name, description,
                  scoring_rule_id, evidence_required, verification_required,
                  approval_required, is_active)

skill_submissions(id, institution_id, skill_activity_id, student_id,
                   submitted_at, details_jsonb, evidence_file_id,
                   status [draft|submitted|pending_review|approved|
                   rejected|returned])
skill_reviews(id, institution_id, skill_submission_id, reviewer_id,
              decision, comments, reviewed_at)

achievement_categories(id, institution_id, name)   -- e.g. Sahityotsav
achievement_levels(id, institution_id, name, sort_order)  -- school…international
achievements(id, institution_id, student_id, category_id, level_id, title,
             position nullable, certificate_file_id, points, status
             [pending|approved|rejected], verified_by)

clubs(id, institution_id, name, description)
club_memberships(id, institution_id, club_id, student_id, joined_date)
events(id, institution_id, name, type, date)
event_participations(id, institution_id, event_id, student_id, role,
                      result nullable)
```

### D.8 Discipline, character, mentoring

```
discipline_categories(id, institution_id, name, is_positive)
discipline_records(id, institution_id, student_id, category_id, date,
                    description, recorded_by, follow_up_notes)

character_attributes(id, institution_id, name)   -- responsibility, respect…
character_assessments(id, institution_id, student_id, attribute_id, period,
                       rating, assessed_by, notes)

mentoring_records(id, institution_id, student_id, mentor_id, date,
                   academic_observation, behaviour_observation,
                   strengths, challenges, goals, action_plan,
                   follow_up_date, confidentiality_level)
```

### D.9 Scoring & consolidated performance

```
scoring_rules(id, institution_id, module, activity_code, condition_jsonb,
              points, bonus_points, max_points, verification_required,
              approval_required, is_active)

score_events(id, institution_id, student_id, source_module, source_entity_type,
             source_entity_id, points, computed_at, scoring_rule_id)

performance_profiles(id, institution_id, name, is_default)
  -- e.g. "Consolidated Student Score" for Badrudhuja — institution-named

performance_components(id, institution_id, performance_profile_id,
                        component_module, weight_percent)

consolidated_scores(id, institution_id, student_id, performance_profile_id,
                     period, score, breakdown_jsonb, computed_at)
  -- materialized/cached result; recomputed on a schedule or on demand
```

### D.10 Portfolio

```
portfolio_events(id, institution_id, student_id, event_type, module,
                  entity_type, entity_id, event_date, title, description,
                  status, score nullable, evidence_file_id nullable,
                  approved_by nullable, approved_at nullable)
  -- append-only event log; official portfolio = events where status='approved'
```

### D.11 Library

```
authors(id, institution_id, name)
publishers(id, institution_id, name)
book_categories(id, institution_id, name)
shelves(id, institution_id, name, location)

books(id, institution_id, isbn, title, subtitle, author_id, publisher_id,
      edition, language, category_id, subject nullable, shelf_id,
      acquisition_date, status)
book_copies(id, institution_id, book_id, copy_code, condition, status
            [available|issued|lost|damaged])

book_issues(id, institution_id, book_copy_id, student_id, issued_by,
            issue_date, due_date, status [issued|returned|overdue|lost])
book_returns(id, institution_id, book_issue_id, returned_by, return_date,
             condition_on_return, fine_amount nullable)

reading_records(id, institution_id, student_id, book_id, book_issue_id,
                 review_text nullable, review_status [not_required|pending|
                 approved|rejected], approved_by nullable)
```

### D.12 Staff performance

```
portion_plans(id, institution_id, academic_year_id, class_id, subject_id,
              teacher_id, chapter_name, planned_date)
portion_completion(id, institution_id, portion_plan_id, completed_date,
                    completion_percent, notes)

teacher_observations(id, institution_id, teacher_id, observer_id, date,
                      criteria_jsonb, overall_notes, follow_up_notes)
```

### D.13 Communication, notification, files, search

```
announcements(id, institution_id, title, body, audience_jsonb, published_by,
              published_at)

notifications(id, institution_id, user_id, type, title, body, channel
              [in_app|email|sms|whatsapp|push], status, sent_at, read_at)

files(id, institution_id, entity_type, entity_id, storage_provider,
      storage_file_id, file_url, file_name, mime_type, size_bytes,
      uploaded_by, is_public)

reports(id, institution_id, report_type, generated_by, parameters_jsonb,
        file_id, generated_at)

approvals(id, institution_id, entity_type, entity_id, status
          [pending|approved|rejected|returned], requested_by, reviewed_by,
          reviewed_at, comments)
```

### D.14 Indexing conventions

Every table gets: `institution_id` indexed (nearly always the first column of a composite index, since almost every query filters by it), a unique constraint scoped by institution where uniqueness is institution-local (e.g. `unique(institution_id, admission_number)` on `students`, not a global unique admission number), and foreign key indexes on all FKs. High-volume tables (`attendance_records`, `marks`, `audit_logs`, `portfolio_events`, `score_events`) additionally get composite indexes matching the analytics query patterns in §N, e.g. `(institution_id, academic_year_id, class_id, section_id)`.

---

## E. Institution Isolation Strategy

### E.1 Defense in depth — two independent gates

```
Client request
   │
   ▼
Gate 1 — APPLICATION LAYER
  • institution_id is resolved server-side from the verified session
    membership (never trusted from client input)
  • Every service function signature requires an institution_id
    parameter; there is no "global" query helper that skips it
  • Code review / lint rule: any database call without a bound
    institution_id (outside explicitly-marked platform-level
    Super Admin services) fails CI
   │
   ▼
Gate 2 — DATABASE LAYER (PostgreSQL Row Level Security)
  • RLS enabled on every tenant-owned table
  • Policy: institution_id = current_setting('app.current_institution_id')::uuid
  • The Postgres session variable app.current_institution_id is set
    once per request/connection from the same server-resolved value
    used in Gate 1 — it is set by the server, never by client input
  • Even if application-layer logic had a bug and forgot to filter by
    institution_id, RLS independently blocks cross-tenant rows
```

Both gates use the *same* server-resolved `institution_id`, so there is exactly one trusted source of truth per request, but it is checked twice by independent mechanisms (app code and database policy) — a bug in one layer does not expose data.

### E.2 Example RLS policy pattern

```sql
alter table students enable row level security;

create policy tenant_isolation_select on students
  for select using (institution_id = current_setting('app.current_institution_id', true)::uuid);

create policy tenant_isolation_write on students
  for insert with check (institution_id = current_setting('app.current_institution_id', true)::uuid);

-- repeated (via migration generator, not hand-written per table) for every
-- tenant-owned table; Super Admin platform routes use a separate, explicitly
-- privileged role/policy rather than disabling RLS globally
```

### E.3 What this blocks, explicitly (per spec §6/§96)

| Attack vector | Why it's blocked |
|---|---|
| URL manipulation (`/students/123` where 123 belongs to another institution) | Row simply doesn't exist under RLS for the requesting session; server returns 404, not 403-with-data-leak |
| API/body manipulation (`institution_id` passed in a request payload) | Ignored — server never reads `institution_id` from client input for scoping; it's only ever read from server-resolved membership |
| ID enumeration | Same as above — RLS filters rows regardless of which ID is guessed |
| Frontend manipulation (hidden fields, devtools) | Frontend has no authority; all checks are server + DB side |
| Direct/exported/report data | Reports and exports run through the same service layer, so they inherit both gates |
| Search/filters | Search queries are institution-scoped at the query-builder level before any filter is applied |

### E.4 Testing tenant isolation (see also §AB)

- Automated integration test suite that creates two institutions with overlapping data shapes (same class names, same admission numbers) and asserts that User A (Institution A) receives zero rows/404 for every Institution B entity ID, across every module's list/detail/export/report/search endpoint.
- A "fuzzing" pass that programmatically tries every entity ID from Institution B against every authenticated route as an Institution A user.
- CI blocks merges that add a new table without an RLS policy (schema linter checks `pg_policies` coverage against tables with an `institution_id` column).

---

## F. Roles & Permissions Matrix

### F.1 Model

Two-level role system: **platform roles** (institution_id = null) and **institution roles** (scoped, seeded as system defaults, extensible per institution). Permissions are fine-grained strings (`module.action`), grouped into roles via `role_permissions`, never checked by role name in application code — always by permission code, so institutions can create custom roles (e.g. "Head of Kithab Section") composed from the same permission catalogue without any code change.

### F.2 Permission check pattern

```
can(user, permission_code, institution_id) → boolean
  1. Resolve user's roles for institution_id (user_roles)
  2. Union all permissions granted by those roles (role_permissions)
  3. Check permission_code is in that set
  4. (Optional per-module) apply field/record-level visibility rule
     (see confidentiality, §F.4)
```

Enforced server-side on every service function and mirrored (not duplicated as the source of truth) on the client only to hide/show UI affordances.

### F.3 Seed permission catalogue (representative, extensible)

| Domain | Permissions |
|---|---|
| Students | `student.view`, `student.view_all`, `student.create`, `student.edit`, `student.delete` |
| Marks | `marks.view`, `marks.enter`, `marks.verify`, `marks.approve`, `marks.lock` |
| Attendance | `attendance.view`, `attendance.enter`, `attendance.edit` |
| Library | `library.view`, `library.issue`, `library.return`, `library.manage` |
| Skills | `skills.submit`, `skills.review`, `skills.approve` |
| Achievements | `achievements.submit`, `achievements.verify`, `achievements.approve` |
| Mentoring | `mentoring.view_own`, `mentoring.view_all`, `mentoring.create` (confidential — see F.4) |
| Discipline | `discipline.view`, `discipline.record` |
| Portfolio | `portfolio.view_own`, `portfolio.view_all`, `portfolio.submit`, `portfolio.approve` |
| Reports | `reports.view`, `reports.export`, `reports.build` |
| Settings | `settings.manage`, `modules.manage`, `users.manage`, `roles.manage` |
| Platform (Super Admin only) | `platform.institutions.manage`, `platform.usage.view`, `platform.audit.view` |

### F.4 Default role → permission grants (seeded per new institution, editable)

| Role | Representative grants |
|---|---|
| Institution Admin | full institution-scoped access, `users.manage`, `roles.manage`, `settings.manage`, `modules.manage` (assignment stays Super Admin-controlled, configuration is Admin-controlled) |
| Principal / Management | `*.view_all` across modules, `marks.approve`, `achievements.approve`, `reports.*`, no `settings.manage`/`users.manage` by default (configurable) |
| Teacher | `marks.enter` (own subject/class only), `attendance.enter` (own class), `skills.review` (if assigned), `student.view` (own class), `portfolio.view_own`(students in class) |
| Staff (generic) | module-specific grants based on assignment |
| Librarian | `library.*`, `student.view` (lookup only) |
| Parent | `student.view` (own children only, row-scoped via `student_parents`), `portfolio.view_own`(children), `reports.view` (own children) |
| Student | `student.view` (self only), `portfolio.view_own` (self), `skills.submit`, `library.view` |

**Confidentiality rule (§75):** mentoring, discipline internal notes, and staff observation notes carry an additional `confidentiality_level` field; visibility is checked via a dedicated rule (`mentoring.view_all` required, not inferred from generic `student.view_all`), so a teacher with broad student-view access does not automatically see mentoring notes.

### F.5 Full CRUD-per-module ownership table (extract — completed per module during build)

| Module | Create | Edit | Approve | View | Export | Delete |
|---|---|---|---|---|---|---|
| Students | Admin, Staff (`student.create`) | Admin, Staff | — | Role-scoped (self/own-class/own-child/all) | `reports.export` holders | Admin only, soft-delete + audit |
| Marks | Teacher (own subject) | Teacher until submitted, then locked | Management/Admin | Role-scoped | `reports.export` | Admin only, with `mark_change_history` |
| Achievements | Student (submit), Staff (record) | Staff until approved | Staff/Management | Role-scoped | `reports.export` | Admin only |
| Library issue/return | Librarian | Librarian | n/a (immediate) | Role-scoped | Librarian/`reports.export` | Librarian (mistaken issue) |
| Mentoring | Assigned mentor | Assigned mentor | n/a (staff-authored) | `mentoring.view_all` or the assigned mentor only | Restricted | Admin only |

(Full matrix — every module × every action × every role — is a build-phase deliverable maintained in `docs/ROLES.md` and kept in sync with the `permissions`/`role_permissions` seed data, not hand-maintained separately from code.)

---

## G. Module Architecture

### G.1 What a "module" is

A module is a self-contained domain package with: its own database tables (or a clearly scoped slice of shared tables), its own service functions, its own UI routes/components, a manifest describing what it needs (permissions it defines, config schema it exposes, events it emits/consumes), and zero direct imports from other modules' internals.

```
modules/
  academic/
  examination/
  attendance/
  library/
  skills-reading/
  skills-writing/
  achievements/
  mentoring/
  discipline/
  portfolio/
  ...
  <module>/
    manifest.ts        -- module_code, name, category, config_schema,
                           permissions_defined, events_emitted, events_consumed
    services/           -- domain logic, called by app routes
    components/          -- module-specific UI
    server/              -- route handlers / server actions
    migrations/          -- module-owned tables (namespaced)
```

### G.2 Module manifest (example)

```ts
export const manifest: ModuleManifest = {
  code: "library",
  name: "Library Management",
  category: "academic-support",
  configSchema: librarySettingsSchema,   // zod/json-schema, drives §I UI
  permissionsDefined: ["library.view", "library.issue", "library.return", "library.manage"],
  eventsEmitted: ["book.issued", "book.returned", "reading_record.approved"],
  eventsConsumed: [],
  dependsOn: [],                          // hard module dependencies, kept minimal
};
```

### G.3 Inter-module communication: event bus, not direct calls

```
LIBRARY module          →  emits "book.returned" event
                              ↓
PORTFOLIO service (core) →  subscribed to "book.returned"
                              → creates a portfolio_event (module=library)
                              ↓
ANALYTICS service (core) →  subscribed to "portfolio_event.created"
                              → updates reading analytics rollups
```

```
EXAMINATION module       →  emits "marks.approved" event (per exam_subject)
PATTERN RECOGNITION      →  subscribed → checks for repeated-low-subject pattern
                              → if threshold met, creates a
                                "student_attention_indicator" record
MENTORING module         →  reads attention indicators when mentor opens
                              a student's mentoring screen (pull, not push,
                              to avoid over-notifying)
```

Implementation: initially an in-process event emitter backed by a durable `domain_events` table (write event → process synchronously or via a lightweight worker reading unprocessed rows), so it behaves correctly even before a dedicated message queue is introduced. This keeps modules decoupled today and gives a clean seam to move to a real queue (e.g. for very large institutions) later without changing module code — only the transport under the `EventBus` interface changes.

### G.4 Core services every module can depend on

`AuthService`, `TenantService`, `PermissionService`, `FileService`, `NotificationService`, `AuditService`, `ApprovalWorkflowService`, `ScoringService`, `PortfolioService`, `ReportingService`, `AnalyticsService`, `SearchService`, `EventBus`. Modules depend on these; core services never depend on a specific module (no `services/portfolio` importing anything from `modules/library`).

---

## H. Module Assignment Architecture

### H.1 Data model

Already introduced in §D.1: `modules` (platform catalogue) + `institution_modules` (per-institution enable/disable). Assignment is Super-Admin-controlled by default (institutions request modules; Super Admin, or a delegated Institution Admin permission `modules.request`, turns them on), matching spec §19 "Super Admin assigns modules."

### H.2 Enable/disable flow

```
Super Admin → Institution Management → select institution
   → Module Library shown with per-module toggle
   → Toggle ON:
        - institution_modules row created/enabled
        - module's default module_configs seeded (sane defaults)
        - module's default permissions granted to default roles
        - navigation/menu entries for that module appear for the
          institution's users immediately (no deploy needed —
          purely data-driven)
   → Toggle OFF:
        - institution_modules.is_enabled = false
        - existing data is NOT deleted (soft-disable) — module UI/nav
          disappears, APIs for that module return 403 for that
          institution, historical data remains queryable by Super Admin
          / on re-enable
```

### H.3 Runtime enforcement

Every module route/service checks `institution_modules.is_enabled` for the current institution+module before executing, via a shared `requireModuleEnabled(moduleCode)` guard — the same guard used by navigation rendering, so UI and API can never drift out of sync (single source of truth: the `institution_modules` table).

### H.4 Dependencies between modules

Some modules logically depend on others (e.g. "Library → Portfolio Integration" assumes Portfolio is available; Portfolio is a **core service**, always present, so this isn't a real dependency). Where a module genuinely depends on another *module* (rare, kept minimal by design), `manifest.dependsOn` is validated at assignment time — Super Admin cannot enable a dependent module without its dependency also enabled.

---

## I. Module Configuration Architecture

### I.1 Three-tier configuration model (per spec §4)

```
TIER 1 — Module Assignment (§H): is the module ON for this institution?
TIER 2 — Module Configuration (this section): HOW does the module behave
          for this institution?
TIER 3 — Custom Module Builder (§J, future): institutions define entirely
          new modules without core code changes
```

### I.2 Configuration storage

`module_configs(institution_id, module_id, config_key, config_value_jsonb)` — each module's manifest declares a `configSchema` (JSON Schema / Zod schema). The Institution Settings UI renders a form generated from that schema (so building a new module automatically gets a working config UI, no bespoke settings page required per module). Values are validated against the schema on save, both client-side (UX) and server-side (integrity — never trust client validation alone).

### I.3 Examples of Tier-2 configuration (per spec §4/§37/§42)

```json
// module: attendance
{
  "default_status": "present",
  "statuses": [
    {"code": "present", "counts_as_present": true},
    {"code": "absent", "counts_as_present": false},
    {"code": "leave", "counts_as_present": false}
  ],
  "exam_eligibility_attendance_pct": 60,
  "late_feeds_discipline": true
}

// module: examination
{
  "exam_types": ["Kithab Main Exam", "Kithab Model Exam",
                 "Academic Main Exam", "Academic Model Exam"],
  "grade_scale_id": "uuid-of-institution-grade-scale"
}

// module: achievements
{
  "levels": ["School", "Local", "District", "State", "National", "International"],
  "categories": ["Sahityotsav", "Mahrajan", "Kalolsav", "Arts Fest", "Other"]
}

// institution_settings (platform-level, drives §S)
{
  "enabled_ui_languages": ["en", "ml"]
}
```

Every one of these is data owned by the institution, editable through the Institution Settings screens — none of it lives in application source code.

### I.4 Configuration versioning

`module_configs` changes are written through the same audit-logged write path as any other record (§Y), so "what were the achievement levels on 1 March 2026" is answerable from `audit_logs`, which matters when scoring or eligibility rules change mid-year and historical records must still be interpretable.

---

## J. Custom Module Future Architecture

### J.1 Scope discipline (per spec §4, §102)

V1–V2 do **not** ship an arbitrary module builder. Instead, the module system (§G) is deliberately shaped so that a future builder is additive, not a rewrite:

- Modules already separate **schema** (config-driven, via `configSchema` + `module_configs`) from **code** (services/UI) — a future builder's job is to let an admin define a new `configSchema` + a small set of generic screens (list/form/approval) rather than hand-write React components.
- The **event bus** (§G.3) and **generic polymorphic tables** (`files`, `approvals`, `portfolio_events` keyed by `entity_type`) mean a custom module's records can plug into files, approvals, portfolio, and scoring the same way a built-in module does, without new core tables.
- The **scoring engine** (§K) already takes `module` as a free-text/config-driven identifier, not an enum tied to built-in modules — so a custom module can define its own scoring rules immediately.

### J.2 Future workflow (design target, not built now)

```
Institution Admin: "Create Custom Module"
   → Module name, category
   → Define fields (typed: text, number, date, select, file, boolean)
   → Define categories/options (like achievement_categories today)
   → Define scoring rule(s) (reuses scoring_rules engine, §K)
   → Define workflow (reuses Approval Workflow Engine, §72/§G)
   → Define permissions (reuses permission catalogue pattern, §F)
   → Define report columns (reuses Reporting Engine, §P)
   → Enable Portfolio integration (checkbox — reuses portfolio_events)
```

This becomes technically feasible once: (1) a generic "record type" table can store field definitions (`custom_module_fields`) and a generic "record instance" table stores values (`custom_module_records` with a `data_jsonb` payload validated against the field definitions), and (2) generic list/detail/form UI components exist that can render from a field-definition schema (needed anyway for the config-driven settings UI in §I, so it is largely shared infrastructure, not new infrastructure). Explicitly deferred until the built-in module library (§24 catalogue) is stable, per spec §4/§102.

---

## K. Scoring Engine Architecture

### K.1 Principle

No institutional point value is ever a literal in application code. All scoring is data: `scoring_rules` rows, interpreted by one generic evaluator. Badrudhuja's specific numbers (§42) are the **first row set** in this table, not special-cased logic.

### K.2 Scoring rule shape

```
scoring_rules
  institution_id
  module              -- "reading", "writing", "publication", "speaking", …
  activity_code        -- "fiction_book", "nonfiction_article", …
  condition_jsonb       -- e.g. {"min_pages": 25, "type": "non_fiction"}
  points                -- base points
  bonus_jsonb           -- e.g. {"per_extra_unit": 2, "unit": "pages", "bonus_points": 1}
  max_points
  verification_required (bool)
  approval_required (bool)
  is_active
```

### K.3 Evaluator

```
ScoringService.evaluate(institution_id, module, activity_code, submission_data)
  1. Load active scoring_rules for (institution_id, module, activity_code)
  2. Match submission_data against condition_jsonb (simple predicate matcher:
     equality, ranges, thresholds — deliberately NOT a full expression
     language in v1, to stay auditable and safe)
  3. Compute base points, apply bonus formula if configured
     (page-based, duration-based, position-based, level-based all reduce
     to "condition → points (+ bonus formula)")
  4. Cap at max_points
  5. If verification_required/approval_required → status stays pending
     until Approval Workflow (§72) clears it
  6. On approval → write score_events row, emit "score_events.created"
```

### K.4 Badrudhuja configuration examples (tenant data, not platform code)

```
Reading:
  fiction:      condition {min_pages:50, type:fiction}     → 3 points
  non_fiction:  condition {min_pages:25, type:non_fiction}  → 5 points
  (verification_required = true, approval_required = true)

Writing:
  fiction article:     3 points
  non_fiction article: base 5 points @ 4 pages,
                        bonus +1 point per additional 2 pages
  (verification_required = true)

Publication:
  non_fiction book, 50 pages → 20 points
  fiction book, 50 pages     → 15 points
  ISBN bonus configurable as an additional bonus_jsonb rule

Speaking:
  public presentation, min 5 minutes → 5 points
  (approval_required = true, approver = staff/committee role)
```

These load as seed data for the Badrudhuja institution record during onboarding — editable afterward by the Institution Admin through the scoring configuration UI (built on the same generic form-from-schema pattern as §I).

### K.5 Consolidated performance (CSS) as a weighted roll-up

```
performance_profiles(institution_id, name)             -- e.g. "CSS" for Badrudhuja
performance_components(performance_profile_id,
                        component_module, weight_percent)

ConsolidatedScoreService.compute(student_id, period)
  for each performance_component of the institution's active profile:
     value = AnalyticsService.getNormalizedScore(component_module,
                                                  student_id, period)
     -- normalized to 0-100 so weights are meaningful across modules
     weighted_sum += value * weight_percent / 100
  write consolidated_scores row with breakdown_jsonb for transparency
```

Weights (e.g. Academic 50% / Skills 15% / Attendance 10% / Achievements 10% / Character 10% / Activities 5%) are §I-tier configuration per institution, recomputed on a schedule (nightly) and on-demand when an approval changes underlying data.

---

## L. Student Portfolio Architecture

### L.1 Event-sourced, not a giant flat table (per spec §89)

`portfolio_events` is an append-only, lightweight log referencing authoritative module records:

```
portfolio_events(id, institution_id, student_id, event_type, module,
                  entity_type, entity_id, event_date, title, description,
                  status, score, evidence_file_id, approved_by, approved_at)
```

The portfolio screen queries this table for the timeline (§L.2) but always **links through** to the authoritative record (`entity_type`/`entity_id`) for full detail — marks stay in `marks`, achievements stay in `achievements`, reading stays in `reading_records`. No duplication of the underlying data, satisfying spec §89/§90 directly.

### L.2 Timeline

```
GET /students/:id/portfolio/timeline
  → portfolio_events where student_id=:id AND status='approved'
    ORDER BY event_date DESC
  → each row renders: date, activity (title), status, score
```

### L.3 Approval-gated writes (per spec §47)

```
Student submits (skill_submissions / achievements / reading_records / …)
   → status = pending
   → NOT written to portfolio_events yet
Authorized staff reviews (Approval Workflow Engine, shared across modules)
   → Approve  → source record status = approved
              → module emits "<module>.approved" event
              → PortfolioService subscriber inserts portfolio_events row
                (status=approved) → feeds ScoringService → feeds
                ConsolidatedScoreService → feeds Analytics
   → Reject   → source record status = rejected, retained for audit,
                never enters portfolio_events as approved
   → Return   → back to student with comments, resubmission allowed
```

Only `status='approved'` rows ever count toward official score, official portfolio, official reports, and official analytics — enforced at the single point where `portfolio_events` are created (a subscriber that only fires on approval events), not scattered across every module.

### L.4 Student 360°

The Student 360° screen (§64) is a read-model composed by one `Student360Service.get(student_id)` call that fans out to: current enrollment, latest results summary, attendance summary, latest consolidated score + breakdown, recent portfolio timeline (last N events), open mentoring goals (permission-gated), active discipline flags (permission-gated). It is a composition service, not a new denormalized table — it reads from each module's existing data through their public service APIs.

---

## M. Library Architecture

### M.1 Catalogue model

`books` (bibliographic record) → `book_copies` (physical/individual copies, since availability tracking is per-copy, not per-title) → `book_issues`/`book_returns` (transactions) → `reading_records` (student-facing review/approval layer). See full columns in §D.11.

### M.2 Issue/return flow

```
Librarian: select student, select book
   → System shows available book_copies for that book (status=available)
   → Select a copy → create book_issues (status=issued, due_date computed
     from institution's configured loan period)
   → book_copies.status = issued

Return:
   → Librarian scans/selects the issue → create book_returns
   → book_copies.status = available (or damaged/lost per condition)
   → fine calculated if overdue, using institution-configured fine rule
     (module_configs for "library": {"fine_per_day": …, "grace_days": …})
   → emits "book.returned" event
```

### M.3 Reading review → portfolio integration (per spec §54)

```
book.returned event
   → if institution's library config requires a reading review:
        reading_records row created (status=pending)
        student prompted to submit review_text
   → Staff approval (Approval Workflow Engine) → status=approved
   → emits "reading_record.approved"
   → PortfolioService creates portfolio_events (module=library)
   → ScoringService applies reading scoring_rules (§K) if configured
   → ConsolidatedScoreService recomputes on next cycle
```

If the institution's config does not require a review, `book.returned` still creates a `reading_records` row (`review_status=not_required`) so reading history/frequency analytics remain accurate even without a review workflow.

### M.4 Library dashboard/analytics data source

Institution/class/student/book-level rollups (§53/§55) are served by `AnalyticsService` reading from `book_issues`, `book_returns`, `reading_records` with the same institution-scoping and materialized-view strategy as §N — library analytics is not a separate bespoke engine.

---

## N. Analytics Architecture

### N.1 Layering

```
RAW MODULE DATA (marks, attendance_records, achievements, reading_records…)
        ↓
AGGREGATION LAYER (SQL views / materialized views, refreshed on a schedule
        or on relevant write events — never computed ad hoc over raw rows
        for dashboard loads)
        ↓
AnalyticsService  (typed query functions: getClassAverage(), 
        getSubjectComparison(), getAttendanceTrend(), …)
        ↓
UI: KPI cards, charts, tables — always with a tabular alternative (§35)
```

### N.2 Standard dimensions

Every analytics query is parameterized by the same dimension set: `institution_id` (always, non-optional), `academic_year_id`, `term_id`, `class_id`, `section_id`, `subject_id`, `student_id`, `exam_id`/`period`. A single `AnalyticsQueryParams` type is shared across modules so filters (§85) are consistent everywhere instead of each screen inventing its own filter shape.

### N.3 Materialized views (representative)

```sql
create materialized view mv_exam_subject_stats as
select institution_id, examination_id, subject_id, class_id, section_id,
       avg(marks_obtained) as avg_marks,
       count(*) filter (where marks_obtained >= pass_marks) as pass_count,
       count(*) as total_count,
       stddev(marks_obtained) as spread
from marks join exam_subjects using (exam_subject_id) ...
group by institution_id, examination_id, subject_id, class_id, section_id;

create materialized view mv_attendance_monthly as
select institution_id, student_id, class_id, section_id,
       date_trunc('month', date) as month,
       count(*) filter (where counts_as_present) as present_days,
       count(*) filter (where is_late) as late_days,
       count(*) as total_days
from attendance_records join attendance_statuses using (status_id) ...
group by institution_id, student_id, class_id, section_id, month;
```

Refresh strategy: `REFRESH MATERIALIZED VIEW CONCURRENTLY`, triggered by a scheduled job (frequent, e.g. hourly, for large institutions) plus an on-demand refresh after bulk mark approval/attendance close-out, so results feel fresh without recomputing on every dashboard load.

### N.4 High/Middle/Low achiever classification (configurable, per spec §30)

```
classification_rules(institution_id, based_on [percentage|average|grade|
                      consolidated_score], high_threshold, low_threshold)

ClassificationService.classify(student_id, period)
  value = resolve(based_on)   -- e.g. consolidated_scores.score
  if value >= high_threshold  → "high_achiever"
  elif value < low_threshold  → "low_achiever"
  else                        → "middle_achiever"
```

No threshold is ever hard-coded; the classification is recomputed whenever the underlying value changes and cached for dashboard performance.

### N.5 Teacher-associated indicators — neutral framing (per spec §29/§62)

`TeacherAssociatedAnalyticsService` returns structured indicators (`average_performance`, `pass_percentage`, `grade_distribution`, `trend`) tagged with a `disclaimer_key` that the UI renders as neutral copy ("performance indicator — requires management interpretation"), never a scored verdict on the teacher. This is enforced by never emitting a single "teacher score," only multi-dimensional, contextual indicators presented alongside the class/section/subject context needed to interpret them.

---

## O. Pattern Recognition Architecture

### O.1 Principle: signals, not conclusions

Every pattern the system surfaces is stored as a `pattern_signal` with a type, confidence/strength, contributing data points, and neutral wording — never a diagnosis. This is a hard architectural constraint, not just a copy-writing guideline: the schema itself has no field for "cause" or "blame," only `observed_pattern`, `contributing_factors_jsonb`, `recommended_action` (generic: "recommended for review").

```
pattern_signals(id, institution_id, student_id, pattern_type, domain
                 [academic|attendance|discipline|achievement|cross_domain],
                 strength [low|medium|high], window_start, window_end,
                 details_jsonb, status [open|reviewed|dismissed],
                 detected_at)
```

### O.2 Detection jobs (scheduled, per domain)

```
Academic pattern job (after each exam's marks are approved):
  compare student's last N exam results per subject
  → flag: consistent_high | consistent_low | improvement | decline |
           sudden_change | subject_specific_weakness | subject_specific_strength

Attendance/discipline pattern job (periodic, e.g. weekly):
  compare attendance trend + discipline record frequency over a window
  → flag: e.g. "academic_decline + increasing_disciplinary_incidents"
    using neutral labels only ("observed pattern", "possible correlation",
    "requires attention") exactly as specified (§32)

Achievement pattern job:
  compare participation/points trend across terms
  → flag: emerging_strength | consistent_strength | declining_participation

Cross-domain job:
  reads pattern_signals across domains for the same student/window
  → surfaces combinations (e.g. academic + attendance) as a
    cross_domain signal, explicitly labeled as an observed data
    correlation, with a UI note distinguishing "data-derived pattern"
    from "human interpretation" (§34), and never presenting
    correlation as causation
```

### O.3 Where signals surface

Pattern signals feed: the mentoring screen (pull-based — a mentor sees open signals for their mentee when opening the record, per §G.3), the management dashboard ("students requiring attention" widget), and the Student 360° view — always with the neutral framing and always requiring a human reviewer to mark `status=reviewed` with optional notes, keeping the system a decision-support tool, not an automated decision-maker (§106).

---

## P. Reporting Architecture

### P.1 One reporting engine, not per-module report code

```
ReportingService
  .generate(report_type, params, format [pdf|xlsx])
     1. Resolve a ReportDefinition (columns, filters, grouping, data source
        query) for report_type — built-ins ship as definitions, not as
        one-off scripts, so the same renderer works for all of them
     2. Run the (institution-scoped, permission-checked) data query
     3. Hand rows + definition to a format renderer:
          PdfRenderer  → institution branding, header/footer, page numbers,
                          subtle "Powered by PROMPT EDU ERP" mark (§12)
          XlsxRenderer → formatted headers, filters, multi-sheet where useful
     4. Persist output via FileService, log a `reports` row, return
        download URL
```

### P.2 Report Definition shape (drives §59 Report Builder later)

```
report_definitions(id, institution_id nullable [null=platform built-in],
                    code, name, data_source, base_query_key,
                    columns_jsonb, default_filters_jsonb,
                    grouping_jsonb, is_system)
```

Authorized users (future Report Builder, §59) compose new `report_definitions` from an approved set of `data_source`/`base_query_key` values (pre-defined, safe query templates) — never raw SQL exposed to end users, directly satisfying "do not expose dangerous arbitrary database queries to ordinary users."

### P.3 Multilingual/data-safe rendering

PDF/Excel rendering uses a font stack covering Latin, Arabic, Malayalam, Urdu, Devanagari, and Kannada glyphs (§S.3) since report data can contain any of these scripts regardless of which UI language generated the report; layout handles mixed-script rows correctly (e.g. an English report containing Arabic or Malayalam names) — verified per script in the testing strategy (§AB).

---

## Q. Bulk Import/Export Architecture

### Q.1 Import pipeline (per spec §56/§86)

```
Download Template (per entity type, generated from the same field/validation
                    schema used for manual entry — one schema, two entry
                    points)
   ↓
Fill Data (Excel/CSV)
   ↓
Upload → ImportService.stage(file, entity_type, institution_id)
   ↓
Parse + Validate (server-side, row by row):
   - required fields, type checks
   - duplicate detection (within file and against existing DB rows,
     institution-scoped)
   - referential checks (class/section/subject exist for this institution —
     tenant mismatch is rejected here)
   - business rules (valid marks range, valid dates, valid enum values)
   ↓
Preview: total rows / valid / invalid / duplicate / warnings, with a
   downloadable error report for invalid rows
   ↓
Confirm → Import runs inside a DB transaction per batch; any row-level
   failure during commit rolls back that batch (never a partially
   corrupted import) — validated rows are committed; the summary shows
   exactly what was imported vs skipped
   ↓
Summary (+ audit_logs entry, + notification to the importer)
```

### Q.2 Export pipeline

Exports reuse the Reporting Engine (§P) for formatting but can also produce raw data exports (CSV/XLSX) directly from any list screen's current filter state, always through the same institution-scoped, permission-checked query layer — an export can never return more than the exporting user is authorized to view.

### Q.3 Supported entities (v1 targets, per spec §56)

Students, parents, teachers/staff, classes, sections, subjects, marks, attendance, achievements, library books — each with its own template + validation schema, all sharing one `ImportService`/`ExportService` implementation parameterized by an `EntityImportDefinition`.

---

## R. PWA Architecture

### R.1 Foundation

Next.js app with a web app manifest and service worker (Workbox-based) generated per institution at request time (or cached per-institution manifest), so each installed app can show the institution's own name/icon/colors (§13) while the underlying code is identical.

```
/manifest.webmanifest  (dynamic route, keyed by institution)
  { name: institution.app_name ?? institution.name,
    short_name: institution.short_name,
    icons: [institution.pwa_icon_192, institution.pwa_icon_512],
    theme_color: institution.primary_color,
    background_color: institution.secondary_color,
    display: "standalone", start_url: "/", scope: "/" }
```

### R.2 Caching strategy

| Asset type | Strategy |
|---|---|
| App shell (JS/CSS) | Precache + stale-while-revalidate |
| Static institution branding (logo, icons) | Cache-first, versioned by file hash |
| API/data reads (dashboards, class lists) | Network-first with a short-lived cache fallback for the "selected offline functionality" cases (§81) |
| Mutations (mark entry, attendance) | Not claimed offline in v1 unless explicitly built with a sync queue + conflict handling (§81) — the app must not silently pretend to save while offline |

### R.3 Explicit non-claims (per spec §81)

The architecture does not present the full ERP as offline-capable. Only specific, deliberately chosen flows (e.g. viewing a cached dashboard, a cached class roster) are offline-available; anything involving a write is either disabled offline with a clear "you're offline" state, or implemented later as an explicit sync-queue feature with visible sync status and conflict handling — never silent.

### R.4 iOS/Android awareness

Push notifications, background sync, and "add to home screen" behavior differ significantly between iOS Safari and Android Chrome. The architecture treats push notifications as a progressive enhancement behind a capability check, with the Notification Service (§70) always also delivering in-app + email so no institution depends on push actually working on every device.

---

## S. Multilingual / RTL Architecture

**Scope clarified by Muhsin (v1):** the application **interface** (menus, buttons, labels, screens) ships in **English only** at first, with **Malayalam** as a second, switchable UI language — enabled per institution (e.g. turned on for Madrasa-type institutions that want it), not forced on every institution. Independently of which UI language a user has selected, every **data-entry field** (names, titles, descriptions, comments, observations, book titles, etc.) must accept and correctly store text typed in **any** of the six target languages (English, Arabic, Malayalam, Urdu, Hindi, Kannada) — a user can type an Arabic name into an English-language screen and it must save, display, and export correctly. This is a narrower, sequenced version of the original six-UI-language target (§18), not a change to the underlying data model, which was already designed Unicode-first.

### S.1 Two independent concerns, kept architecturally separate

```
UI LANGUAGE (interface chrome)          DATA LANGUAGE (what users type)
  - translation keys / locale bundles      - plain UTF-8 text, any script,
  - v1 bundles built: en, ml                 any field, regardless of
  - institution-level toggle: which UI        active UI language
    languages are offered to its users       - no translation needed —
  - extensible pool for later: ar, ur,        it's just Unicode storage +
    hi, kn (locale bundle + RTL work           correct font rendering
    deferred, not designed away — §S.4)
```

Keeping these separate means Malayalam-as-UI-language shipping now, and Arabic/Urdu/Hindi/Kannada-as-UI-language shipping later, is purely "add a locale bundle" — it never touches the database, validation, or storage layer, which already had to be Unicode-safe for data entry regardless of UI scope.

### S.2 i18n foundation (UI chrome)

`next-intl` (or equivalent) with translation keys — no hard-coded UI strings in components (§18). Locale bundles shipped in v1: `en` (default, always available), `ml` (Malayalam). `institution_settings` holds an `enabled_ui_languages` list (e.g. `["en"]` by default, `["en","ml"]` for a Madrasa-type institution or any institution that requests it) — this is Tier-2 module/institution configuration (§I), set by Super Admin or Institution Admin, **never hard-coded to institution type in application code** (e.g. no `if institution.type == "madrasa"` branch — the toggle is data, matching the platform's non-negotiable configuration-over-hard-coding rule, §2/§107.7). A user whose institution has more than one enabled UI language gets a language switcher; everyone else just sees English. `institutions.default_locale` sets the initial language for new users; `users.preferred_locale` overrides it per person.

### S.3 Data-level multilingual support (always-on, all six languages, regardless of UI scope)

- Database: PostgreSQL is UTF-8 by default — every free-text column (names, titles, descriptions, comments, observations) accepts any script with no schema change. This was already true in §D and is unaffected by the UI-language sequencing decision above.
- Where an institution needs the *same* entity labeled in multiple languages simultaneously (e.g. a book title recorded in both Arabic and English), a `translations` pattern is used rather than fixed `_ar`/`_en` columns per field, so it scales to all six languages without schema churn regardless of how many are exposed as UI languages:

```
translations(id, institution_id, entity_type, entity_id, field_name,
             locale, value)
  -- e.g. (entity_type='books', field_name='title', locale='ar', value='...')
```

- Core fields that are simply "entered in whatever language the user typed" (e.g. a student's name as written by the registrar, in Arabic, Malayalam, or any supported script) stay as a plain text column — validated only for length/required-ness, never restricted by script or language. Input validation must not assume Latin/English characters anywhere in the platform.
- Font stack (UI + PDF/Excel rendering) covers Latin, Arabic, Malayalam, Urdu, Devanagari (Hindi), and Kannada glyphs from v1, even though only `en`/`ml` are exposed as *interface* languages — because names, titles, and free text in any of the six scripts can appear inside an English-language screen at any time and must render correctly (§S.1).

### S.4 RTL readiness (design-in-place, not built for v1)

Malayalam is LTR, so v1 ships no RTL UI. The design system nonetheless uses CSS logical properties (`margin-inline-start` instead of `margin-left`, etc.) throughout (§77) from the start, so that when Arabic and/or Urdu are later promoted from "data language" to "UI language," components mirror automatically under `dir="rtl"` rather than requiring a redesign. `<html dir>` is derived from the active locale at render time, ready to flip per-user once an RTL locale bundle ships.

### S.5 Exports

PDF/Excel exports (§P.3) correctly render whatever scripts appear in the underlying data (an English report can contain an Arabic student name or a Malayalam book title in the same row) regardless of the exporting user's UI language — tested explicitly per script, since this is a data-language concern (§S.3), not a UI-language one.

---

## T. Storage Abstraction

### T.1 FileService interface (per spec §10)

```ts
interface FileService {
  uploadFile(institutionId, entityType, entityId, file): Promise<FileRecord>;
  getFile(fileId): Promise<FileRecord>;
  getDownloadUrl(fileId, opts?): Promise<string>;
  deleteFile(fileId): Promise<void>;
  moveFile(fileId, toProvider): Promise<FileRecord>;
}
```

`files` table (§D.13) stores `storage_provider`, `storage_file_id`, `file_url`, decoupling every domain table (students' photos, achievements' certificates, skill evidence) from knowing which backend actually holds the bytes — they only ever hold a `file_id` foreign key.

### T.2 Provider implementations

```
FileService
  ├── SupabaseStorageProvider   (v1 default)
  └── GoogleDriveProvider        (added later, §U, same interface)
```

Institution-level (or even file-level) `storage_provider` selection means a migration can proceed institution-by-institution, or even file-by-file within an institution, without a big-bang cutover.

---

## U. Google Drive Migration Strategy

### U.1 Trigger

Deferred until explicitly requested (§10/§11) — architecture keeps it ready, not mandatory for v1.

### U.2 Migration approach

```
For each file where storage_provider = 'supabase':
  1. Download bytes from Supabase Storage
  2. Upload to the institution's configured Google Drive
     location (Shared Drive folder structure mirroring
     entity_type/entity_id for traceability)
  3. Update files row: storage_provider='google_drive',
     storage_file_id=<drive file id>, file_url=<drive link>
  4. Verify (checksum/size match) before deleting the Supabase copy
  5. Log migration in audit_logs
```

Runs as a background job, batched per institution, resumable (idempotent on `files.id`), so a failed batch can be retried without re-migrating already-moved files. The academic database schema requires no change — only `files` rows are updated — satisfying "academic database must not depend directly on a specific storage provider" (§10).

### U.3 Access model differences

`GoogleDriveProvider.getDownloadUrl()` must account for Drive's sharing/permission model differing from Supabase Storage's signed URLs — implemented behind the same interface so callers never branch on provider.

---

## V. Supabase → Neon Migration Strategy

### V.1 Why this is low-risk by design

Because the app avoids Supabase-specific SQL features beyond RLS (which is standard PostgreSQL) and Supabase-specific client SDK calls are isolated behind `AuthService`/`FileService` (never called ad hoc from domain code), the database itself is portable: it is "PostgreSQL with RLS," which Neon (or any managed Postgres) supports natively.

### V.2 Migration approach

```
1. Schema migration files (versioned, e.g. via a migration tool) are
   provider-agnostic SQL — run identically against Neon
2. `pg_dump` / logical replication from Supabase Postgres → Neon Postgres
3. Cut over connection string (single config value, since all DB access
   goes through one connection layer, never scattered .env reads)
4. Re-point AuthService: either (a) migrate to Neon-hosted auth/self-hosted
   auth, or (b) keep Supabase Auth while data lives in Neon — the
   architecture doesn't force Auth and Database to move together, since
   AuthService only needs to resolve a stable user identifier, which is
   stored in `users.auth_user_id` and not otherwise entangled with schema
5. Validate RLS policies function identically (they are standard Postgres,
   not a Supabase extension)
```

### V.3 What would need to change

Only Supabase-specific convenience features if adopted casually (e.g. Supabase Realtime, Edge Functions) would need replacement; the architecture avoids depending on these for core flows, using the portable `EventBus`/background job abstraction (§G.3) instead.

---

## W. Super Admin Usage Architecture

### W.1 Application-level usage meter (per spec §21 — not a billing claim)

```
usage_metrics(institution_id, period_start, period_end, student_count,
              staff_count, parent_count, user_count, storage_bytes,
              file_count, record_count, active_user_count,
              api_request_count, imports_count, exports_count,
              reports_generated_count)
```

Populated by a scheduled rollup job (counts current rows per institution) plus incremental counters for activity-style metrics (API requests, imports, exports, reports) written at request time via a lightweight, async-flushed counter (not a synchronous write on every request, to avoid latency impact). Explicitly documented as an **application-level usage meter**, distinct from whatever the underlying Postgres/storage provider bills at the project level — this framing is carried into the Super Admin UI copy itself, not just this document.

### W.2 Limits & warnings (per spec §22)

```
subscription_plans(max_students, max_staff, max_users, max_storage_mb, …)
institutions.plan_id → subscription_plans

LimitService.check(institution_id, resource)
  usage = latest usage_metrics row
  limit = plan.max_<resource>
  pct = usage / limit
  → surfaced in Super Admin + Institution Admin dashboards as
    "Student capacity: 94%", "Storage: 82%"
  → soft warnings at configurable thresholds (e.g. 80%, 95%);
    hard block only on the specific action that would exceed a
    hard limit (e.g. creating student #501 on a 500-cap plan),
    never a retroactive lockout of existing data
```

Payment processing is explicitly out of scope until requested (§22) — plan assignment is manual/Super-Admin-set in v1.

### W.3 Super Admin dashboard data (per spec §20)

Platform Overview and per-institution Overview screens are read models composed from `institutions`, `usage_metrics`, and `institution_modules` — again a composition service (`SuperAdminDashboardService`), not new bespoke tables duplicating counts that already exist elsewhere.

---

## X. Security Architecture

### X.1 Layered controls

| Layer | Controls |
|---|---|
| Transport | TLS everywhere; HSTS |
| Authentication | Supabase Auth (abstracted via `AuthService`); MFA support path for staff/admin roles; session expiry + refresh |
| Authorization | RBAC + fine-grained permissions (§F), enforced server-side on every action, mirrored (not sourced) client-side |
| Tenant isolation | Dual-gate app-layer + RLS (§E) |
| Input validation | Schema validation (Zod) on every server action/route handler input, independent of client-side validation |
| Secrets | Service-role keys, DB credentials, provider secrets live only in server-side environment configuration; never shipped to the client bundle; a build-time check fails CI if a secret-looking env var is referenced from client code |
| Rate limiting | Applied at the edge/middleware for auth endpoints and bulk-write endpoints (import, mark entry) to blunt brute-force and abuse |
| File access | Signed, time-limited URLs (`FileService.getDownloadUrl`) rather than public buckets; institution-scoped access check before a signed URL is issued |
| Confidentiality | Field/module-level visibility for mentoring/discipline/observation records (§F.4), independent of the general `view_all` grants |
| Audit | Every state-changing action logged (§Y) |
| Backups/DR | See §X.3 |

### X.2 Never-trust-the-client rules (explicit, testable)

1. `institution_id` is never read from client input for authorization decisions (§E.3).
2. Role/permission claims are re-derived server-side per request, never trusted from a client-held token payload beyond the identity claim itself.
3. File uploads are validated server-side (type, size) regardless of client-side checks.
4. Bulk import never inserts unvalidated rows (§Q.1) — validation always runs server-side even if a client claims a file is "already validated."

### X.3 Backup & recovery (per spec §95)

- Automated daily database backups (point-in-time recovery where the provider supports it), retained per a defined policy, tested with periodic restore drills (a backup that has never been restored is not a verified backup).
- File storage backup strategy tracked per provider (Supabase Storage lifecycle rules initially; Drive's own versioning/trash later).
- A documented disaster-recovery runbook (`DEPLOYMENT.md`/`SECURITY.md`, §Z) covering RTO/RPO targets, defined once real hosting is selected for production rather than assumed from the provider's defaults.

---

## Y. Audit Architecture

### Y.1 What is logged

`audit_logs` (institution-scoped) and `platform_audit_logs` (Super Admin/cross-tenant actions) capture: actor, institution, action, module, entity type/id, before/after value snapshots (JSON diff, not full-row dumps where rows are large), timestamp, IP/user-agent where legally and technically appropriate (§73/§X.1).

Explicitly tracked action classes: marks changes (also mirrored into `mark_change_history` for a dedicated correction view), attendance changes, achievement approvals, permission/role changes, student deletion (soft-delete, never a hard delete of a student record), bulk imports, exports, report generation, configuration changes (module assignment, module config, scoring rules).

### Y.2 Write path

Audit writes happen inside the same service-layer transaction as the underlying change (not a best-effort side channel), so an audit entry is never silently lost if the primary write succeeds — implemented as a thin `AuditService.record()` call invoked by the generic write-service wrapper that all mutating service functions pass through, rather than hand-added to every individual function (consistency by construction, not by developer discipline alone).

### Y.3 Access to audit data

Audit logs are read-only even to Institution Admins (no update/delete permission exists for `audit_logs` in the permission catalogue), viewable via a dedicated `audit.view` permission, with Super Admin able to view platform-wide audit activity across institutions for support/compliance purposes — itself an audited action.

---

## Z. Project Folder Structure

```
prompt-edu-erp/
├── app/                        # Next.js App Router
│   ├── (institution)/          # institution-context routes (dashboard, modules)
│   ├── (super-admin)/          # platform-level routes, separate layout/guard
│   ├── (auth)/                 # login, session
│   ├── (portals)/              # student / parent portal route groups
│   └── api/                    # route handlers where server actions don't fit
├── modules/                    # one folder per domain module (§G)
│   ├── academic/
│   ├── examination/
│   ├── attendance/
│   ├── skills-reading/ … 
│   ├── achievements/
│   ├── mentoring/
│   ├── discipline/
│   ├── library/
│   └── portfolio/               # core, always-on "module"
├── services/                    # core, module-agnostic services (§G.4)
│   ├── auth/ tenant/ permissions/ storage/ notifications/
│   ├── scoring/ portfolio/ analytics/ pattern-recognition/
│   ├── reporting/ import-export/ audit/ approval-workflow/ search/
│   └── event-bus/
├── database/                    # schema, migrations, RLS policies, seeds
│   ├── migrations/
│   ├── policies/
│   └── seeds/                   # default roles/permissions, sample plans
├── components/                  # shared design system (buttons, tables…)
├── features/                    # cross-module composed UI (Student 360°,
│                                 #   Super Admin dashboards)
├── i18n/                        # locale files (en, ml in v1), RTL utilities
├── lib/                         # generic utilities (not domain-specific)
├── hooks/                       # shared React hooks
├── types/                       # shared TypeScript types/schemas
├── public/                      # static assets, dynamic manifest route
├── tests/                       # unit, integration, tenant-isolation, e2e
└── docs/
    ├── README.md ARCHITECTURE.md DATABASE.md SECURITY.md MODULES.md
    ├── SETUP.md DEPLOYMENT.md REPORTING.md ANALYTICS.md
    └── I18N.md PWA.md STORAGE.md CHANGELOG.md ROLES.md
```

Rationale: `modules/` vs `services/` is the single most important boundary in the tree — it is what makes "configuration over hard-coding" and "modules communicate via events, not direct imports" enforceable by folder/import-lint rules rather than convention alone. `app/(super-admin)/` being a distinct route group (with its own layout and auth guard) keeps platform-level operations visibly and structurally separate from institution-scoped code, reducing the chance of an accidental cross-tenant code path.

---

## AA. Development Roadmap

### AA.1 Phase 0 — Foundation (per spec §100/§101, "must work securely" before anything else)

Project setup (Next.js/TypeScript) → Supabase connection → multi-tenancy scaffolding (`institutions`, RLS pattern proven on one table) → authentication → roles/permissions seed → academic years/classes/sections/subjects → students + basic profile → tenant isolation tests passing → basic dashboard → PWA foundation (manifest/service worker shell) → i18n foundation (English shipped as the default and only-required UI language; Malayalam locale bundle wired end to end in the same phase so the "second UI language, per-institution toggle" mechanism is proven early rather than retrofitted — data-entry Unicode-safety for all six target languages is verified from the very first `students`/free-text field, since that requires no extra UI work, only correct storage/font handling).

Exit criterion (must work securely end to end): `Login → Institution context → Dashboard → Create class → Create section → Create subject → Create student (with a non-English name) → View student`, with a second test institution proving isolation on every step.

### AA.2 Phase order (per spec §101)

| Phase | Scope |
|---|---|
| 1 | Foundation: multi-tenancy, institutions, users, roles, permissions, i18n, PWA |
| 2 | Academic: students, classes, sections, subjects, academic years |
| 3 | Examination: exams, marks, grades, results |
| 4 | Attendance: attendance, late arrival, leave |
| 5 | Core analytics: institution/class/section/grade/subject/student/teacher-associated |
| 6 | Performance: reading, writing, speaking, language, achievements |
| 7 | Scoring: configurable scoring engine + consolidated performance |
| 8 | Portfolio: timeline, approvals, Student 360° |
| 9 | Library: catalogue, librarian, issue/return, reading history, portfolio integration |
| 10 | Staff: attendance, leave, portion completion, teacher performance |
| 11 | Mentoring/discipline: mentoring, behaviour, character |
| 12 | Parent/student portals and dashboards |
| 13 | Reporting: PDF, Excel, report builder |
| 14 | Bulk operations: import/export |
| 15 | Communication: notifications, email, SMS/WhatsApp architecture |
| 16 | Google Drive storage migration/integration |
| 17 | Super Admin: usage, limits, system monitoring |
| 18 | Production: security hardening, performance, backups, monitoring, deployment |

### AA.3 Per-phase working method (per spec §97 — non-negotiable)

Before each phase: explain architecture changes → explain database changes → explain security implications → explain affected files → implement → test → fix → document. Existing working functionality is inspected and its dependencies understood before modification; nothing is changed silently.

---

## AB. Testing Strategy

| Area | Test approach |
|---|---|
| Tenant isolation | Two-institution integration suite + ID-enumeration fuzzing across every list/detail/export/report/search endpoint (§E.4) |
| Permissions | Per-role negative tests ("teacher cannot call admin-only action") generated from the permission catalogue itself, so new permissions get default-denied coverage automatically |
| Student/parent privacy | Student session cannot fetch another student's record by ID; parent session limited to linked children via `student_parents` |
| Staff/confidential records | Mentoring/discipline visibility tests independent of general `view_all` grants |
| Bulk import | Malformed-file fixtures assert zero partial writes (transaction rollback verified) and correct error reporting |
| Scoring engine | Table-driven tests: given a `scoring_rules` config + submission data, assert computed points, including bonus/max-cap edge cases |
| Approval workflow | Unapproved submissions verified absent from `portfolio_events`, `consolidated_scores`, and reports/analytics until approved |
| Library | Issue/return correctly flips `book_copies.status`, generates `reading_records`, and feeds portfolio only per configured review requirement |
| Reports | Snapshot/golden-file tests per report type against known input data |
| Multilingual (data-entry) | Every free-text field tested with sample values in all six target scripts, verifying storage, display, and PDF/Excel export render correctly regardless of active UI language |
| UI language switching | English default verified everywhere; Malayalam toggle tested per institution (on/off), language switcher only appears when more than one UI language is enabled, RTL layout mechanism (§S.4) verified structurally even though no RTL locale ships in v1 |
| PWA | Installability checks (Lighthouse), responsive workflow tests per breakpoint, explicit offline-flow tests only for the flows that claim offline support |
| Security | Dependency scanning, secret-scanning in CI, periodic access-control review, rate-limit verification on auth/bulk endpoints |
| Performance | Load tests against representative large-institution data volumes (attendance/marks tables) before each institution-facing analytics feature ships |

CI gates: no merge without tenant-isolation suite passing; no new tenant-owned table without an accompanying RLS policy (§E.4); no new permission without at least one negative-access test.

---

## AC. Risks and Architectural Decisions

### AC.1 Key decisions and why

| Decision | Alternative considered | Why this choice |
|---|---|---|
| Shared schema + RLS multi-tenancy | Schema-per-tenant / DB-per-tenant | Only model that scales to 1,000+ institutions on one codebase without linear migration/ops cost; dedicated-DB escape hatch preserved for large tenants (§A.6) |
| Modular monolith | Microservices from day one | Avoids premature distributed-systems complexity; module boundaries + event bus keep a later extraction viable |
| Event bus over direct module calls | Direct cross-module function calls | Keeps modules independent per spec §5; enables the future custom-module builder to plug in the same way |
| JSON-schema-driven config over hard-coded settings screens | Bespoke settings UI per module | Directly implements "configuration over hard-coding"; also gives the future custom-module builder its UI mechanism for free |
| Portfolio as an event log referencing source records | A single denormalized "student everything" table | Avoids data duplication/sync bugs (§89/§90); keeps each module authoritative for its own data |
| Storage/Auth abstraction interfaces | Calling Supabase SDK directly throughout the app | Required for the explicitly planned Google Drive and possible Neon migrations without a rewrite |
| Neutral-language pattern recognition schema (no "cause" field) | Free-text AI-generated conclusions | Structural guarantee against overreach/false causal claims (§32/§34/§62), not just a prompt-level guideline |
| English-only UI at launch + per-institution Malayalam toggle, with all-six-language data entry from day one | Building all six UI languages simultaneously before launch | Matches Muhsin's clarified priority: ship faster with the UI languages actually needed now (English, optionally Malayalam), while never restricting what users can *type*, since that only needs Unicode storage, not translation work |

### AC.2 Risks and mitigations

| Risk | Mitigation |
|---|---|
| RLS policy drift as new tables are added | Schema linter in CI checks every tenant-owned table has a matching policy before merge (§E.4) |
| Institution-specific "just this once" hard-coding creeping in under deadline pressure | Code review checklist explicitly bans `institution.code == "..."`-style branches; any institution-specific need is routed through `module_configs`/`scoring_rules` |
| Analytics performance at scale (large mark/attendance tables) | Materialized views + scheduled refresh + pagination/server-side filtering designed in from Phase 5, not retrofitted later |
| Free-tier Supabase limits constraining early growth | Usage metering (§W) surfaces this early; migration paths to Neon (§V) and dedicated DBs (§A.6) are pre-designed, not improvised under pressure |
| Over-scoping v1 (building HR/payroll/fees/LMS/custom-module-builder too early) | Roadmap (§AA) explicitly excludes these until the core platform is stable and requested (§102) |
| PWA offline claims exceeding what's actually implemented | Explicit non-claims documented (§R.3); only flows with real sync/conflict handling are marketed as offline-capable |
| Teacher-associated analytics being misread as performance judgments | Enforced neutral framing at the data-shape level (§N.5), not left to UI copy discipline alone |
| Confidential mentoring/discipline data leaking via broad `view_all` roles | Dedicated confidentiality permission tier independent of general view permissions (§F.4) |
| Badrudhuja-specific values leaking into platform code during first-tenant build pressure | All Badrudhuja numbers (§K.4) are seed *data* for one institution row, reviewed against this rule explicitly before Phase 6/7 sign-off |
| "English-only UI" assumption accidentally blocking non-Latin data entry somewhere in the codebase | Input validation is reviewed platform-wide to confirm no field assumes Latin characters; data-entry multilingual tests (§AB) run against every free-text field, not just the ones expected to receive non-English input |

### AC.3 Open questions for Muhsin before Phase 1 kickoff

1. Confirm whether a fuller standalone Badrudhuja proposal document exists beyond what's embedded in the master prompt (§42) — if so, share it so scoring/exam-type/achievement-category seed data can be finalized precisely rather than from the summary already captured here.
2. Confirm initial subscription plan tiers/limits (even placeholder numbers) so `subscription_plans` seed data isn't left empty through Phase 17.
3. ~~Language sequencing~~ — resolved: English-only UI at launch, Malayalam as an optional per-institution second UI language, Unicode data entry in all six target languages from day one (§S).
4. Confirm which institutions besides Badrudhuja (if any) are expected in the first 3–6 months, since that affects how soon the Malayalam UI toggle and multi-institution Super Admin flows need to be battle-tested beyond a single tenant.

---

*End of architecture phase document. Per §103/§97: implementation does not begin until this document is reviewed. Next step on approval: Phase 0/Phase 1 kickoff, starting with the multi-tenancy + RLS foundation and the two-institution isolation test suite, exactly as described in §AA.1.*
