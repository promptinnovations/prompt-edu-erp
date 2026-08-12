-- =============================================================================
-- PROMPT EDU ERP — Migration 0008: Performance (skills + achievements)
-- ARCHITECTURE.md §D.7 (Skills, achievements, activities), Phase 6 (§AA.2:
-- "reading, writing, speaking, language, achievements").
--
-- skill_types/skill_activities and achievement_categories/achievement_levels
-- are institution CONFIGURATION (§K/§254 "config tables vs transaction
-- tables are separated everywhere") — skill_submissions/achievements are the
-- transaction tables that reference them. No skill name, achievement
-- category, or workflow requirement (evidence/verification/approval) is
-- ever a literal in application code.
-- =============================================================================

create table skill_types (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  code             text not null,
  name             text not null,
  created_at       timestamptz not null default now(),
  unique (institution_id, code)
);

create table skill_activities (
  id                     uuid primary key default gen_random_uuid(),
  institution_id         uuid not null references institutions(id) on delete cascade,
  skill_type_id          uuid not null references skill_types(id) on delete cascade,
  name                   text not null,
  description            text,
  evidence_required      boolean not null default false,
  verification_required  boolean not null default true,
  approval_required      boolean not null default false,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now()
);

-- Lifecycle: draft -> submitted -> pending_review -> approved|rejected|returned
-- (returned sends it back for the student to revise, i.e. back toward draft).
create table skill_submissions (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  skill_activity_id uuid not null references skill_activities(id) on delete cascade,
  student_id        uuid not null references students(id) on delete cascade,
  submitted_at      timestamptz,
  details_jsonb     jsonb,
  status            text not null default 'draft',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (status in ('draft', 'submitted', 'pending_review', 'approved', 'rejected', 'returned'))
);

create table skill_reviews (
  id                    uuid primary key default gen_random_uuid(),
  institution_id        uuid not null references institutions(id) on delete cascade,
  skill_submission_id   uuid not null references skill_submissions(id) on delete cascade,
  reviewer_id           uuid,
  decision              text not null, -- verified|rejected|returned|approved
  comments              text,
  reviewed_at           timestamptz not null default now(),
  check (decision in ('verified', 'rejected', 'returned', 'approved'))
);

create table achievement_categories (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,
  created_at       timestamptz not null default now(),
  unique (institution_id, name)
);

create table achievement_levels (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (institution_id, name)
);

create table achievements (
  id                     uuid primary key default gen_random_uuid(),
  institution_id         uuid not null references institutions(id) on delete cascade,
  student_id             uuid not null references students(id) on delete cascade,
  category_id            uuid not null references achievement_categories(id),
  level_id               uuid not null references achievement_levels(id),
  title                  text not null,
  "position"             text,
  points                 numeric(6,2),
  status                 text not null default 'pending', -- pending|approved|rejected
  verified_by            uuid,
  approved_by            uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (status in ('pending', 'approved', 'rejected'))
);

create index idx_skill_types_institution on skill_types(institution_id);
create index idx_skill_activities_institution on skill_activities(institution_id, skill_type_id);
create index idx_skill_submissions_institution on skill_submissions(institution_id, skill_activity_id);
create index idx_skill_submissions_student on skill_submissions(institution_id, student_id);
create index idx_skill_reviews_submission on skill_reviews(institution_id, skill_submission_id);
create index idx_achievement_categories_institution on achievement_categories(institution_id);
create index idx_achievement_levels_institution on achievement_levels(institution_id);
create index idx_achievements_institution on achievements(institution_id, student_id);
create index idx_achievements_status on achievements(institution_id, status);

-- RLS — same dual-gate pattern as prior migrations (§E).
do $$
declare
  t text;
  performance_tables text[] := array[
    'skill_types','skill_activities','skill_submissions','skill_reviews',
    'achievement_categories','achievement_levels','achievements'
  ];
begin
  foreach t in array performance_tables loop
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
