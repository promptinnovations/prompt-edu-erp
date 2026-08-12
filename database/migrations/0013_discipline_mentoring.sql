-- =============================================================================
-- PROMPT EDU ERP — Migration 0013: Discipline, character, mentoring
-- ARCHITECTURE.md §D.8 (Discipline, character, mentoring), Phase 11
-- (§AA.2).
--
-- discipline_categories/character_attributes are institution CONFIGURATION
-- (§K/§254) — never a hard-coded list, same pattern as
-- attendance_statuses/skill_types/achievement_categories.
--
-- Character permissions: §F.3's permission table only lists mentoring.* and
-- discipline.* (no separate character.* codes) even though §D.8 groups
-- discipline/character/mentoring under one module heading — this build
-- reuses discipline.view/discipline.record for character assessments
-- rather than inventing permissions the spec doesn't define.
--
-- Confidentiality (§75/§F.4): mentoring_records carries a
-- confidentiality_level column, but the actual access control is the
-- "assigned mentor OR mentoring.view_all" rule enforced in
-- modules/mentoring/service.ts, not a database-level policy — RLS's
-- institution-isolation gate has no notion of "which staff member", so
-- this is an application-layer (service-function) gate on top of it,
-- consistent with how portfolio/scoring visibility is already gated in
-- service code rather than in SQL.
-- =============================================================================

create table discipline_categories (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,
  is_positive      boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (institution_id, name)
);

create table discipline_records (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  category_id        uuid not null references discipline_categories(id),
  date               date not null,
  description        text,
  recorded_by        uuid,
  follow_up_notes    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table character_attributes (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,
  created_at       timestamptz not null default now(),
  unique (institution_id, name)
);

-- rating: 1-5 (no explicit scale given in the master spec; documented
-- default, same "pick a sane concrete default and document it" approach as
-- Phase 10's employment_status enum). getNormalizedScore()'s 'character'
-- branch (modules/scoring/service.ts) normalizes avg(rating)/5*100.
create table character_assessments (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  attribute_id     uuid not null references character_attributes(id),
  period           text not null,
  rating           integer not null,
  assessed_by      uuid,
  notes            text,
  created_at       timestamptz not null default now(),
  check (rating between 1 and 5)
);

-- mentor_id references staff(id), not users(id) directly — mirrors
-- portion_plans.teacher_id/teacher_observations.teacher_id from migration
-- 0012, since "assigned mentor only" visibility needs to resolve to a
-- concrete staff record the acting user's own staff.id can be compared
-- against.
create table mentoring_records (
  id                     uuid primary key default gen_random_uuid(),
  institution_id         uuid not null references institutions(id) on delete cascade,
  student_id             uuid not null references students(id) on delete cascade,
  mentor_id              uuid not null references staff(id),
  date                   date not null,
  academic_observation   text,
  behaviour_observation  text,
  strengths              text,
  challenges             text,
  goals                  text,
  action_plan            text,
  follow_up_date         date,
  confidentiality_level  text not null default 'standard',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (confidentiality_level in ('standard', 'restricted'))
);

create index idx_discipline_records_student on discipline_records(institution_id, student_id, date);
create index idx_character_assessments_student on character_assessments(institution_id, student_id, period);
create index idx_mentoring_records_student on mentoring_records(institution_id, student_id, date);
create index idx_mentoring_records_mentor on mentoring_records(institution_id, mentor_id);

-- RLS — same dual-gate pattern as every prior migration (§E).
do $$
declare
  t text;
  dm_tables text[] := array[
    'discipline_categories','discipline_records',
    'character_attributes','character_assessments',
    'mentoring_records'
  ];
begin
  foreach t in array dm_tables loop
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
