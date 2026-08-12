-- =============================================================================
-- PROMPT EDU ERP — Migration 0012: Staff module
-- ARCHITECTURE.md §D.4 (People — staff), §D.12 (Staff performance), §D.3
-- (teacher_assignments, created in 0001 but unused until now) / Phase 10
-- (§AA.2).
--
-- The `staff` table itself was ALREADY created back in migration 0001 (§D.4
-- was drafted up front alongside students/parents) and already has RLS
-- enabled there — this migration only tightens it (staff_code uniqueness,
-- an explicit employment_status check, created_at/updated_at) rather than
-- recreating it. staff_attendance/staff_leave were created in migration
-- 0006 (§D.6) with a bare `staff_id uuid not null` — no FK, since `staff`
-- had no unique-enough shape to reference confidently at that point either;
-- this migration adds that FK now.
--
-- staff_leave is intentionally left UNUSED by this build: leave_applications
-- (0006) already generically supports applicant_type='staff' with a full
-- apply/review workflow (modules/attendance/service.ts), so
-- modules/staff/service.ts reuses that instead of duplicating the workflow
-- against a second table. staff_leave remains in the schema (matching the
-- master spec literally) as a tracked cleanup candidate — see
-- docs/SETUP.md "Known follow-ups".
-- =============================================================================

-- users_select_self (migration 0001) only lets a user see their OWN row
-- (or a super admin / the reserved app.can_view_all_users flag, unused so
-- far) — fine until now, since no module needed to list OTHER users'
-- names. The staff directory is the first (listStaff/getStaffMember,
-- teacher_assignments, portion_plans all join staff -> users for a
-- display name), so this adds a third, narrowly-scoped SELECT policy:
-- visible to anyone whose CURRENT institution context (app.current_
-- institution_id, already gate-1-validated elsewhere) is one the target
-- user also holds an active membership in — i.e. "my colleagues in the
-- institution I'm currently acting within", nothing broader. Same
-- incremental-self-visibility pattern as 0003/0004; RLS SELECT policies
-- are OR'd together, so this only adds visibility, never removes any.
-- A plain subquery here would recurse: this policy (on `users`) would query
-- user_institution_memberships, whose OWN select policy (migration 0003)
-- queries `users` right back, and Postgres detects that structural cycle
-- regardless of the actual data ("infinite recursion detected in policy for
-- relation users"). Break it with a SECURITY DEFINER function: it's created
-- by the migration-owner role, which is exempt from RLS by design (see
-- database/scripts/migrate.ts's header comment) — while the function body
-- runs, that exemption applies, so its internal query bypasses RLS on
-- user_institution_memberships instead of re-entering this policy.
create function user_shares_current_institution(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from user_institution_memberships uim
     where uim.user_id = target_user_id
       and uim.institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
       and uim.status = 'active'
  );
$fn$;

create policy users_select_institution_colleague on users for select
  using (user_shares_current_institution(id));

alter table staff add column created_at timestamptz not null default now();
alter table staff add column updated_at timestamptz not null default now();
alter table staff alter column staff_code set not null;
alter table staff add constraint staff_staff_code_unique unique (institution_id, staff_code);
alter table staff add constraint staff_employment_status_check
  check (employment_status in ('active', 'on_leave', 'resigned', 'terminated'));

alter table staff_attendance
  add constraint staff_attendance_staff_id_fkey
  foreign key (staff_id) references staff(id) on delete cascade;

alter table staff_leave
  add constraint staff_leave_staff_id_fkey
  foreign key (staff_id) references staff(id) on delete cascade;

-- 0006's `unique (institution_id, staff_id, date, period)` doesn't behave as
-- an upsert target when period is null: Postgres treats each NULL as
-- distinct under a plain multi-column unique constraint, so repeated
-- "mark attendance, no period" calls for the same staff/date would insert
-- duplicate rows instead of updating one, unlike attendance_records (whose
-- unique key never includes a nullable column). Replace it with an
-- expression index that normalizes null -> '' so ON CONFLICT can target it.
alter table staff_attendance drop constraint staff_attendance_institution_id_staff_id_date_period_key;
create unique index staff_attendance_upsert_key
  on staff_attendance (institution_id, staff_id, date, (coalesce(period, '')));

-- §D.12 Staff performance: curriculum/portion (syllabus) coverage tracking.
-- A portion_plan is "this teacher must cover this chapter in this
-- class/subject by this date" (created by admin/management or the teacher
-- themself); portion_completion rows are progress updates against it
-- (multiple allowed — the most recent completion_percent is the current
-- status), never a single mutable percent column on the plan itself, so the
-- history of when progress was logged is preserved (same append-style
-- pattern as skill_reviews/mark_change_history elsewhere in this schema).
create table portion_plans (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  academic_year_id   uuid not null references academic_years(id),
  class_id           uuid not null references classes(id),
  subject_id         uuid not null references subjects(id),
  teacher_id         uuid not null references staff(id),
  chapter_name       text not null,
  planned_date       date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table portion_completion (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid not null references institutions(id) on delete cascade,
  portion_plan_id      uuid not null references portion_plans(id) on delete cascade,
  completed_date       date not null,
  completion_percent   integer not null,
  notes                text,
  recorded_by          uuid,
  created_at           timestamptz not null default now(),
  check (completion_percent between 0 and 100)
);

-- §D.12: structured classroom observations of a teacher by
-- management/a peer — deliberately free-form via criteria_jsonb (§K "no
-- institutional rubric is ever hard-coded"; an institution's own observation
-- rubric/criteria list is its own configuration, not this platform's).
create table teacher_observations (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  teacher_id       uuid not null references staff(id),
  observer_id      uuid not null,
  date             date not null,
  criteria_jsonb   jsonb,
  overall_notes    text,
  follow_up_notes  text,
  created_at       timestamptz not null default now()
);

create index idx_portion_plans_institution on portion_plans(institution_id, teacher_id);
create index idx_portion_plans_class_subject on portion_plans(institution_id, class_id, subject_id);
create index idx_portion_completion_plan on portion_completion(institution_id, portion_plan_id);
create index idx_teacher_observations_teacher on teacher_observations(institution_id, teacher_id);

-- teacher_assignments (§D.3) was created in migration 0001 but had no
-- service/UI until this phase — index it the same way other high-cardinality
-- lookup tables are indexed here rather than back in 0001.
create index idx_teacher_assignments_teacher on teacher_assignments(institution_id, user_id);

-- RLS — same dual-gate pattern as every prior migration (§E). `staff` itself
-- is excluded here since migration 0001 already enabled RLS + all four
-- policies for it.
do $$
declare
  t text;
  staff_tables text[] := array[
    'portion_plans','portion_completion','teacher_observations'
  ];
begin
  foreach t in array staff_tables loop
    execute format('alter table %I enable row level security;', t);

    execute format(
      'create policy tenant_isolation_select on %I for select
         using (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                or current_setting(''app.is_super_admin'', true) = ''true'');', t);

    execute format(
      'create policy tenant_isolation_insert on %I for insert
         with check (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                     or current_setting(''app.is_super_admin'', true) = ''true'');', t);

    execute format(
      'create policy tenant_isolation_update on %I for update
         using (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                or current_setting(''app.is_super_admin'', true) = ''true'')
         with check (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                     or current_setting(''app.is_super_admin'', true) = ''true'');', t);

    execute format(
      'create policy tenant_isolation_delete on %I for delete
         using (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                or current_setting(''app.is_super_admin'', true) = ''true'');', t);
  end loop;
end $$;
