-- =============================================================================
-- PROMPT EDU ERP — Migration 0009: Scoring engine + consolidated performance
-- ARCHITECTURE.md §D.9, §K (Scoring Engine Architecture), §K.5, Phase 7 (§AA.2).
--
-- scoring_rules is institution CONFIGURATION (§K.1 "no institutional point
-- value is ever a literal in application code") — Badrudhuja's numbers
-- (§K.4) are the FIRST ROW SET in this table, not special-cased logic.
-- score_events is the computed/transaction table (§254 config vs
-- transaction separation).
-- =============================================================================

create table scoring_rules (
  id                      uuid primary key default gen_random_uuid(),
  institution_id          uuid not null references institutions(id) on delete cascade,
  module                  text not null,       -- "reading", "writing", "speaking", …
  activity_code           text not null,       -- "fiction_book", "weekly_reading_log", …
  condition_jsonb         jsonb not null default '{}'::jsonb,
  points                  numeric(6,2) not null,
  bonus_jsonb             jsonb,                -- {"per_extra_unit":2,"unit":"pages","bonus_points":1}
  max_points              numeric(6,2),
  verification_required   boolean not null default true,
  approval_required       boolean not null default true,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now()
);

create table score_events (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references institutions(id) on delete cascade,
  student_id          uuid not null references students(id) on delete cascade,
  source_module       text not null,
  source_entity_type  text not null,
  source_entity_id    uuid,
  points              numeric(6,2) not null,
  scoring_rule_id     uuid references scoring_rules(id),
  computed_at         timestamptz not null default now()
);

create table performance_profiles (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,   -- e.g. "Consolidated Student Score" — institution-named
  is_default       boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (institution_id, name)
);

create table performance_components (
  id                        uuid primary key default gen_random_uuid(),
  institution_id            uuid not null references institutions(id) on delete cascade,
  performance_profile_id    uuid not null references performance_profiles(id) on delete cascade,
  component_module          text not null,   -- "academic", "attendance", "skills", "achievements", …
  weight_percent            numeric(5,2) not null,
  unique (institution_id, performance_profile_id, component_module)
);

create table consolidated_scores (
  id                        uuid primary key default gen_random_uuid(),
  institution_id            uuid not null references institutions(id) on delete cascade,
  student_id                uuid not null references students(id) on delete cascade,
  performance_profile_id    uuid not null references performance_profiles(id),
  period                    text not null,   -- an institution-meaningful label, e.g. "2026-2027 / Term 1"
  score                     numeric(6,2) not null,
  breakdown_jsonb           jsonb not null default '{}'::jsonb,
  computed_at               timestamptz not null default now(),
  unique (institution_id, student_id, performance_profile_id, period)
);

create index idx_scoring_rules_institution on scoring_rules(institution_id, module, activity_code);
create index idx_score_events_institution on score_events(institution_id, student_id);
create index idx_score_events_source on score_events(institution_id, source_module, computed_at);
create index idx_performance_profiles_institution on performance_profiles(institution_id);
create index idx_performance_components_profile on performance_components(institution_id, performance_profile_id);
create index idx_consolidated_scores_student on consolidated_scores(institution_id, student_id, period);

-- RLS — same dual-gate pattern as prior migrations (§E).
do $$
declare
  t text;
  scoring_tables text[] := array[
    'scoring_rules','score_events','performance_profiles',
    'performance_components','consolidated_scores'
  ];
begin
  foreach t in array scoring_tables loop
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
